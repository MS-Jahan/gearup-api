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
