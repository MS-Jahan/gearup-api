import { Router, Response } from "express";
import Stripe from "stripe";
import { prisma } from "../../config/database";
import { config } from "../../config";
import { AppError, sendSuccess } from "../../utils/apiResponse";
import { authenticate, authorize, asyncHandler } from "../../middleware/auth";
import { confirmPaymentSchema, createPaymentSchema } from "../../middleware/validate";
import { AuthRequest, getParam } from "../../utils/helpers";

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
 *     summary: Confirm payment after Stripe succeeds
 */
router.post(
  "/confirm",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { paymentIntentId } = confirmPaymentSchema.parse(req.body);

    const payment = await prisma.payment.findFirst({
      where: {
        stripePaymentIntentId: paymentIntentId,
        customerId: req.user!.userId,
      },
      include: { rentalOrder: true },
    });

    if (!payment) {
      throw new AppError("Payment not found", 404);
    }

    if (payment.status === "COMPLETED") {
      sendSuccess(res, payment, "Payment already confirmed");
      return;
    }

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (intent.status !== "succeeded") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED" },
      });
      throw new AppError("Payment not completed", 400, {
        stripeStatus: intent.status,
      });
    }

    const [updatedPayment] = await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "COMPLETED", paidAt: new Date() },
      }),
      prisma.rentalOrder.update({
        where: { id: payment.rentalOrderId },
        data: { status: "PAID" },
      }),
    ]);

    sendSuccess(res, updatedPayment, "Payment confirmed");
  })
);

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
