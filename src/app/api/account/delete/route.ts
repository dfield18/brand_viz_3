export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

/**
 * POST /api/account/delete
 * Deletes the current user's account and all associated data.
 */
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Cancel Stripe subscription if active
    const sub = await prisma.userSubscription.findUnique({ where: { userId } });
    if (sub?.stripeSubscriptionId) {
      try {
        await getStripe().subscriptions.cancel(sub.stripeSubscriptionId);
      } catch (err) {
        console.error("[account/delete] Failed to cancel Stripe subscription:", err instanceof Error ? err.message : err);
      }
    }

    // Delete user data from DB
    await prisma.userSubscription.deleteMany({ where: { userId } });
    await prisma.brandView.deleteMany({ where: { userId } });

    // Delete user from Clerk
    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId);

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[account/delete] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete account" },
      { status: 500 },
    );
  }
}
