import { Request, Response } from "express";
import Stripe from "stripe";
import { config } from "../../config";
import { AppError } from "../../utils/apiResponse";
import {
  completePaymentByIntentId,
  failPaymentByIntentId,
} from "./payment.service";

const getStripe = () => {
  if (!config.stripe.secretKey) {
    throw new AppError("Stripe is not configured", 500);
  }
  return new Stripe(config.stripe.secretKey);
};

export async function stripeWebhookHandler(req: Request, res: Response) {
  const stripe = getStripe();
  const signature = req.headers["stripe-signature"];

  if (!signature || typeof signature !== "string") {
    res.status(400).send("Missing Stripe signature");
    return;
  }

  if (!config.stripe.webhookSecret) {
    res.status(500).send("Stripe webhook secret is not configured");
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      config.stripe.webhookSecret
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    res.status(400).send(`Webhook Error: ${message}`);
    return;
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await completePaymentByIntentId(intent.id);
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await failPaymentByIntentId(intent.id);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    res.status(500).send("Webhook handler failed");
    return;
  }

  res.json({ received: true });
}
