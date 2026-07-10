import { Router, Response } from "express";
import { prisma } from "../../config/database";
import { config } from "../../config";
import { AppError, sendSuccess } from "../../utils/apiResponse";
import { authenticate, authorize, asyncHandler } from "../../middleware/auth";
import { confirmPaymentSchema, createPaymentSchema, paginationQuerySchema } from "../../middleware/validate";
import { AuthRequest, getParam, paginatedResponse } from "../../utils/helpers";
import {
  completePaymentByCheckoutSession,
  completePaymentByIntentId,
} from "./payment.service";
import Stripe from "stripe";

const router = Router();

const getStripe = () => {
  if (!config.stripe.secretKey) {
    throw new AppError("Stripe is not configured", 500);
  }
  return new Stripe(config.stripe.secretKey);
};

const paymentResultPage = (title: string, message: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title} — GearUp</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 4rem auto; padding: 0 1rem; text-align: center; }
    h1 { color: #0f766e; }
    p { color: #475569; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>${message}</p>
</body>
</html>`;

const buildPayPageUrl = (sessionId: string) => {
  const baseUrl = config.appUrl.replace(/\/$/, "");
  return `${baseUrl}/api/payments/pay?session_id=${sessionId}`;
};

const embeddedCheckoutPage = (
  publishableKey: string,
  clientSecret: string,
  amount: string
) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pay — GearUp</title>
  <script src="https://js.stripe.com/v3/"></script>
  <style>
    body { font-family: system-ui, sans-serif; background: #f8fafc; margin: 0; padding: 2rem 1rem; }
    .wrap { max-width: 520px; margin: 0 auto; }
    h1 { font-size: 1.35rem; color: #0f172a; margin: 0 0 0.25rem; }
    .amount { color: #475569; margin-bottom: 1.25rem; }
    #checkout { min-height: 420px; }
    .err { background: #fef2f2; color: #991b1b; padding: 1rem; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>GearUp rental payment</h1>
    <p class="amount">Amount: $${amount} USD</p>
    <div id="checkout"></div>
    <div id="error" class="err" style="display:none"></div>
  </div>
  <script>
    (async () => {
      try {
        const stripe = Stripe(${JSON.stringify(publishableKey)});
        const checkout = await stripe.initEmbeddedCheckout({
          clientSecret: ${JSON.stringify(clientSecret)},
        });
        checkout.mount("#checkout");
      } catch (err) {
        const el = document.getElementById("error");
        el.style.display = "block";
        el.textContent = err.message || "Failed to load checkout";
      }
    })();
  </script>
</body>
</html>`;

/**
 * @swagger
 * /api/payments/pay:
 *   get:
 *     tags: [Payments]
 *     summary: Embedded Stripe Checkout payment page
 */
router.get(
  "/pay",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const sessionId = req.query.session_id as string | undefined;
    if (!sessionId) {
      throw new AppError("session_id query parameter is required", 400);
    }
    if (!config.stripe.publishableKey) {
      res
        .type("html")
        .send(
          paymentResultPage(
            "Stripe not configured",
            "STRIPE_PUBLISHABLE_KEY is missing on the server. Add it in Vercel env vars (pk_test_...)."
          )
        );
      return;
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.status !== "open") {
      res
        .type("html")
        .send(
          paymentResultPage(
            "Checkout unavailable",
            `This payment session is ${session.status}. Create a new payment from the API.`
          )
        );
      return;
    }

    if (!session.client_secret) {
      throw new AppError("Checkout session has no client secret", 500);
    }

    const amount = session.amount_total
      ? (session.amount_total / 100).toFixed(2)
      : "0.00";

    res
      .type("html")
      .send(
        embeddedCheckoutPage(
          config.stripe.publishableKey,
          session.client_secret,
          amount
        )
      );
  })
);

/**
 * @swagger
 * /api/payments/success:
 *   get:
 *     tags: [Payments]
 *     summary: Stripe Checkout success redirect page
 */
router.get(
  "/success",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const sessionId = req.query.session_id as string | undefined;
    if (sessionId && config.stripe.secretKey) {
      try {
        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === "paid") {
          await completePaymentByCheckoutSession(session);
        }
      } catch (err) {
        console.error("Payment success page confirmation error:", err);
      }
    }
    res
      .type("html")
      .send(
        paymentResultPage(
          "Payment successful",
          "Your rental payment was received. You can close this tab and return to the app."
        )
      );
  })
);

/**
 * @swagger
 * /api/payments/cancel:
 *   get:
 *     tags: [Payments]
 *     summary: Stripe Checkout cancel redirect page
 */
router.get(
  "/cancel",
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    res
      .type("html")
      .send(
        paymentResultPage(
          "Payment cancelled",
          "No charge was made. You can try again from the rental order."
        )
      );
  })
);

router.use(authenticate, authorize("CUSTOMER"));

/**
 * @swagger
 * /api/payments/create:
 *   post:
 *     tags: [Payments]
 *     summary: Create Stripe Checkout session for rental order
 *     description: |
 *       Returns a payment page `url` on this API — open it in a browser to pay via Stripe Checkout.
 *       After payment, Stripe calls `/api/payments/webhook` and the order is marked PAID.
 */
router.post(
  "/create",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { rentalOrderId } = createPaymentSchema.parse(req.body);

    const order = await prisma.rentalOrder.findFirst({
      where: { id: rentalOrderId, customerId: req.user!.userId },
      include: {
        items: { include: { gearItem: { select: { name: true } } } },
      },
    });

    if (!order) {
      throw new AppError("Rental order not found", 404);
    }

    if (!["PLACED", "CONFIRMED"].includes(order.status)) {
      throw new AppError("Order is not payable in current status", 400);
    }

    const existing = await prisma.payment.findUnique({
      where: { rentalOrderId },
    });
    if (existing?.status === "COMPLETED") {
      throw new AppError("Order already paid", 400);
    }

    const stripe = getStripe();
    const amountCents = Math.round(Number(order.totalAmount) * 100);
    const gearNames = order.items.map((i) => i.gearItem.name).join(", ");
    const baseUrl = config.appUrl.replace(/\/$/, "");

    if (!config.stripe.publishableKey) {
      throw new AppError(
        "STRIPE_PUBLISHABLE_KEY is not configured on the server",
        500
      );
    }

    const customer = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { email: true },
    });

    if (
      existing?.stripePaymentIntentId &&
      existing.stripePaymentIntentId.startsWith("cs_")
    ) {
      const oldSession = await stripe.checkout.sessions.retrieve(
        existing.stripePaymentIntentId
      );
      if (oldSession.status === "open" && oldSession.client_secret) {
        sendSuccess(
          res,
          {
            payment: existing,
            url: buildPayPageUrl(oldSession.id),
            sessionId: oldSession.id,
          },
          "Checkout session ready"
        );
        return;
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "embedded",
      redirect_on_completion: "if_required",
      customer_email: customer?.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "GearUp rental order",
              description: gearNames || `Order ${order.id}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        rentalOrderId: order.id,
        customerId: req.user!.userId,
      },
      return_url: `${baseUrl}/api/payments/success?session_id={CHECKOUT_SESSION_ID}`,
    });

    if (!session.client_secret) {
      throw new AppError("Failed to create Stripe Checkout session", 500);
    }

    const payment = await prisma.payment.upsert({
      where: { rentalOrderId },
      create: {
        rentalOrderId: order.id,
        customerId: req.user!.userId,
        amount: order.totalAmount,
        provider: "STRIPE",
        stripePaymentIntentId: session.id,
        status: "PENDING",
      },
      update: {
        stripePaymentIntentId: session.id,
        status: "PENDING",
        paidAt: null,
      },
    });

    sendSuccess(
      res,
      {
        payment,
        url: buildPayPageUrl(session.id),
        sessionId: session.id,
      },
      "Checkout session created",
      201
    );
  })
);

/**
 * @swagger
 * /api/payments/confirm:
 *   post:
 *     tags: [Payments]
 *     summary: Confirm payment manually (fallback if webhook is delayed)
 */
router.post(
  "/confirm",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = confirmPaymentSchema.parse(req.body);
    const stripe = getStripe();

    if (data.sessionId) {
      const session = await stripe.checkout.sessions.retrieve(data.sessionId);
      const { payment, alreadyCompleted } =
        await completePaymentByCheckoutSession(session, {
          customerId: req.user!.userId,
          verifyWithStripe: stripe,
        });
      sendSuccess(
        res,
        payment,
        alreadyCompleted ? "Payment already confirmed" : "Payment confirmed"
      );
      return;
    }

    const { payment, alreadyCompleted } = await completePaymentByIntentId(
      data.paymentIntentId!,
      {
        customerId: req.user!.userId,
        verifyWithStripe: stripe,
      }
    );

    sendSuccess(
      res,
      payment,
      alreadyCompleted ? "Payment already confirmed" : "Payment confirmed"
    );
  })
);

/**
 * @swagger
 * /api/payments:
 *   get:
 *     tags: [Payments]
 *     summary: Get customer payment history (paginated)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 */
router.get(
  "/",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const query = paginationQuerySchema.parse(req.query);
    const where = { customerId: req.user!.userId };
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          rentalOrder: {
            include: { items: { include: { gearItem: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
      }),
      prisma.payment.count({ where }),
    ]);

    sendSuccess(res, paginatedResponse(items, total, query.page, query.limit));
  })
);

/**
 * @swagger
 * /api/payments/{id}:
 *   get:
 *     tags: [Payments]
 *     summary: Get payment details by ID
 */
router.get(
  "/:id",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const payment = await prisma.payment.findFirst({
      where: { id: getParam(req.params.id), customerId: req.user!.userId },
      include: {
        rentalOrder: {
          include: { items: { include: { gearItem: true } } },
        },
      },
    });

    if (!payment) {
      throw new AppError("Payment not found", 404);
    }

    sendSuccess(res, payment);
  })
);

export default router;
