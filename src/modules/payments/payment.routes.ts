import { Router, Response } from "express";
import { prisma } from "../../config/database";
import { config } from "../../config";
import { AppError, sendSuccess } from "../../utils/apiResponse";
import { authenticate, authorize, asyncHandler } from "../../middleware/auth";
import { confirmPaymentSchema, createPaymentSchema } from "../../middleware/validate";
import { AuthRequest, getParam } from "../../utils/helpers";
import { completePaymentByIntentId } from "./payment.service";
import Stripe from "stripe";

const router = Router();

const getStripe = () => {
  if (!config.stripe.secretKey) {
    throw new AppError("Stripe is not configured", 500);
  }
  return new Stripe(config.stripe.secretKey);
};

router.use(authenticate, authorize("CUSTOMER"));

/**
 * @swagger
 * /api/payments/create:
 *   post:
 *     tags: [Payments]
 *     summary: Create Stripe payment intent for rental order
 *     description: |
 *       Returns a clientSecret for Stripe.js. When the customer pays, Stripe sends
 *       `payment_intent.succeeded` to `/api/payments/webhook` and the order is marked PAID
 *       automatically. `/api/payments/confirm` remains available as a manual fallback.
 */
router.post(
  "/create",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { rentalOrderId } = createPaymentSchema.parse(req.body);

    const order = await prisma.rentalOrder.findFirst({
      where: { id: rentalOrderId, customerId: req.user!.userId },
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

    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      payment_method_types: ["card"],
      automatic_payment_methods: { enabled: false },
      metadata: {
        rentalOrderId: order.id,
        customerId: req.user!.userId,
      },
    });

    const payment = await prisma.payment.upsert({
      where: { rentalOrderId },
      create: {
        rentalOrderId: order.id,
        customerId: req.user!.userId,
        amount: order.totalAmount,
        provider: "STRIPE",
        stripePaymentIntentId: intent.id,
        status: "PENDING",
      },
      update: {
        stripePaymentIntentId: intent.id,
        status: "PENDING",
      },
    });

    sendSuccess(res, {
      payment,
      clientSecret: intent.client_secret,
    }, "Payment intent created", 201);
  })
);

/**
 * @swagger
 * /api/payments/confirm:
 *   post:
 *     tags: [Payments]
 *     summary: Confirm payment after Stripe succeeds (optional fallback)
 *     description: |
 *       Prefer the Stripe webhook at `/api/payments/webhook` for automatic confirmation.
 *       Use this endpoint only when webhooks are unavailable (e.g. local Swagger testing).
 */
router.post(
  "/confirm",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { paymentIntentId } = confirmPaymentSchema.parse(req.body);

    const stripe = getStripe();
    const { payment, alreadyCompleted } = await completePaymentByIntentId(
      paymentIntentId,
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
