export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/stripe/webhook
 * Handles Stripe webhook events for subscription lifecycle.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("[stripe/webhook] Signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;
      const userId = session.metadata?.userId;

      if (userId && subscriptionId) {
        // Fetch subscription details for period end
        const sub = await getStripe().subscriptions.retrieve(subscriptionId);
        await prisma.userSubscription.upsert({
          where: { userId },
          create: {
            userId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            plan: "pro",
            status: "active",
            currentPeriodEnd: new Date(((sub as unknown as Record<string, number>).current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 86400) * 1000),
          },
          update: {
            stripeSubscriptionId: subscriptionId,
            plan: "pro",
            status: "active",
            currentPeriodEnd: new Date(((sub as unknown as Record<string, number>).current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 86400) * 1000),
          },
        });
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;

      const userSub = await prisma.userSubscription.findUnique({
        where: { stripeCustomerId: customerId },
      });

      if (userSub) {
        const isActive = sub.status === "active" || sub.status === "trialing";
        await prisma.userSubscription.update({
          where: { id: userSub.id },
          data: {
            status: isActive ? "active" : sub.status === "past_due" ? "past_due" : "canceled",
            plan: isActive ? "pro" : "free",
            currentPeriodEnd: new Date(((sub as unknown as Record<string, number>).current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 86400) * 1000),
          },
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;

      const userSub = await prisma.userSubscription.findUnique({
        where: { stripeCustomerId: customerId },
      });

      if (userSub) {
        await prisma.userSubscription.update({
          where: { id: userSub.id },
          data: { status: "canceled", plan: "free" },
        });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
