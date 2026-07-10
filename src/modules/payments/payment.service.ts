import Stripe from "stripe";
import { prisma } from "../../config/database";
import { AppError } from "../../utils/apiResponse";
import { Payment } from "@prisma/client";

export type PaymentCompletionResult = {
  payment: Payment;
  alreadyCompleted: boolean;
};

export async function findPaymentByIntentId(
  paymentIntentId: string,
  customerId?: string
) {
  return prisma.payment.findFirst({
    where: {
      stripePaymentIntentId: paymentIntentId,
      ...(customerId ? { customerId } : {}),
    },
    include: { rentalOrder: true },
  });
}

export async function findPaymentBySessionId(
  sessionId: string,
  customerId?: string
) {
  return prisma.payment.findFirst({
    where: {
      stripeCheckoutSessionId: sessionId,
      ...(customerId ? { customerId } : {}),
    },
    include: { rentalOrder: true },
  });
}

async function markPaymentCompleted(paymentId: string, rentalOrderId: string) {
  const [updatedPayment] = await prisma.$transaction([
    prisma.payment.update({
      where: { id: paymentId },
      data: { status: "COMPLETED", paidAt: new Date() },
    }),
    prisma.rentalOrder.update({
      where: { id: rentalOrderId },
      data: { status: "PAID" },
    }),
  ]);
  return updatedPayment;
}

export async function completePaymentByIntentId(
  paymentIntentId: string,
  options?: { customerId?: string; verifyWithStripe?: Stripe }
): Promise<PaymentCompletionResult> {
  const payment = await findPaymentByIntentId(
    paymentIntentId,
    options?.customerId
  );

  if (!payment) {
    throw new AppError("Payment not found", 404);
  }

  if (payment.status === "COMPLETED") {
    return { payment, alreadyCompleted: true };
  }

  if (options?.verifyWithStripe) {
    const intent = await options.verifyWithStripe.paymentIntents.retrieve(
      paymentIntentId
    );
    if (intent.status !== "succeeded") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED" },
      });
      throw new AppError("Payment not completed", 400, {
        stripeStatus: intent.status,
      });
    }
  }

  const updatedPayment = await markPaymentCompleted(
    payment.id,
    payment.rentalOrderId
  );

  return { payment: updatedPayment, alreadyCompleted: false };
}

export async function completePaymentByCheckoutSession(
  session: Stripe.Checkout.Session,
  options?: { customerId?: string; verifyWithStripe?: Stripe }
): Promise<PaymentCompletionResult> {
  const rentalOrderId = session.metadata?.rentalOrderId;
  if (!rentalOrderId) {
    throw new AppError("Checkout session missing rental order metadata", 400);
  }

  let payment = session.id
    ? await findPaymentBySessionId(session.id, options?.customerId)
    : null;

  if (!payment) {
    payment = await prisma.payment.findFirst({
      where: {
        rentalOrderId,
        ...(options?.customerId ? { customerId: options.customerId } : {}),
      },
      include: { rentalOrder: true },
    });
  }

  if (!payment) {
    throw new AppError("Payment not found for checkout session", 404);
  }

  if (payment.status === "COMPLETED") {
    return { payment, alreadyCompleted: true };
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (options?.verifyWithStripe && session.id) {
    const verified = await options.verifyWithStripe.checkout.sessions.retrieve(
      session.id
    );
    if (verified.payment_status !== "paid") {
      throw new AppError("Checkout session not paid", 400, {
        paymentStatus: verified.payment_status,
      });
    }
  }

  const updatedPayment = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "COMPLETED",
      paidAt: new Date(),
      stripeCheckoutSessionId: session.id ?? payment.stripeCheckoutSessionId,
      ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
    },
  });

  await prisma.rentalOrder.update({
    where: { id: payment.rentalOrderId },
    data: { status: "PAID" },
  });

  return { payment: updatedPayment, alreadyCompleted: false };
}

export async function failPaymentByIntentId(
  paymentIntentId: string
): Promise<Payment | null> {
  const payment = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
  });

  if (!payment || payment.status === "COMPLETED") {
    return payment;
  }

  return prisma.payment.update({
    where: { id: payment.id },
    data: { status: "FAILED" },
  });
}
