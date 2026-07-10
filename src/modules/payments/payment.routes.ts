import { Router, Response } from "express";
import { prisma } from "../../config/database";
import { config } from "../../config";
import { AppError, sendSuccess } from "../../utils/apiResponse";
import { authenticate, authorize, asyncHandler } from "../../middleware/auth";
import { confirmPaymentSchema, createPaymentSchema } from "../../middleware/validate";
import { AuthRequest, getParam } from "../../utils/helpers";
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
 *       Returns a hosted Stripe Checkout `url` — open it in a browser to pay.
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

    if (
      existing?.stripePaymentIntentId &&
      existing.stripePaymentIntentId.startsWith("cs_")
    ) {
      const oldSession = await stripe.checkout.sessions.retrieve(
        existing.stripePaymentIntentId
      );
      if (oldSession.status === "open" && oldSession.url) {
        sendSuccess(
          res,
          {
            payment: existing,
            url: oldSession.url,
            sessionId: oldSession.id,
          },
          "Checkout session ready"
        );
        return;
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
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
      success_url: `${baseUrl}/api/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/api/payments/cancel?rental_order_id=${order.id}`,
    });

    if (!session.url) {
      throw new AppError("Failed to create Stripe Checkout URL", 500);
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
        url: session.url,
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
 *     summary: Get customer payment history
 */
router.get(
  "/",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const payments = await prisma.payment.findMany({
      where: { customerId: req.user!.userId },
      include: {
        rentalOrder: {
          include: { items: { include: { gearItem: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    sendSuccess(res, payments);
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
