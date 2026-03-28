import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";
import { renderReportEmail } from "@/lib/email/renderReportEmail";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "reports@visibility.ai";

/**
 * POST /api/reports/send-email
 *
 * Called by Vercel Cron (or manually) to send scheduled email reports.
 * Finds all enabled subscriptions due for sending based on frequency,
 * fetches the report for each brand, and sends via Resend.
 *
 * Query params:
 *   ?frequency=weekly (default) — which subscriptions to process
 *   ?brandSlug=xyz — optionally limit to one brand (for testing)
 */
export async function POST(req: NextRequest) {
  // Verify cron secret (Vercel sets CRON_SECRET automatically)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const frequency = req.nextUrl.searchParams.get("frequency") || "weekly";
  const brandSlugFilter = req.nextUrl.searchParams.get("brandSlug");

  // Find due subscriptions
  const where: Record<string, unknown> = {
    enabled: true,
    frequency,
  };

  // Skip if sent recently (weekly = 6 days, monthly = 27 days)
  const cooldownDays = frequency === "monthly" ? 27 : 6;
  const cooldownDate = new Date(Date.now() - cooldownDays * 86_400_000);
  where.OR = [
    { lastSentAt: null },
    { lastSentAt: { lt: cooldownDate } },
  ];

  if (brandSlugFilter) {
    const brand = await prisma.brand.findUnique({ where: { slug: brandSlugFilter } });
    if (brand) where.brandId = brand.id;
  }

  const subscriptions = await prisma.emailSubscription.findMany({
    where,
    include: { brand: true },
    take: 50, // process in batches to stay within function timeout
  });

  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, message: "No subscriptions due" });
  }

  // Group by brand to avoid fetching the same report multiple times
  const byBrand = new Map<string, { brandSlug: string; brandName: string; emails: { id: string; email: string }[] }>();
  for (const sub of subscriptions) {
    const key = sub.brandId;
    if (!byBrand.has(key)) {
      byBrand.set(key, {
        brandSlug: sub.brand.slug,
        brandName: sub.brand.displayName || sub.brand.name,
        emails: [],
      });
    }
    byBrand.get(key)!.emails.push({ id: sub.id, email: sub.email });
  }

  let sent = 0;
  const errors: string[] = [];

  for (const [, group] of byBrand) {
    try {
      // Fetch report data from own API
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";
      const reportRes = await fetch(
        `${baseUrl}/api/report?brandSlug=${encodeURIComponent(group.brandSlug)}&model=all&range=90`,
      );
      if (!reportRes.ok) {
        errors.push(`Report fetch failed for ${group.brandSlug}: ${reportRes.status}`);
        continue;
      }
      const reportJson = await reportRes.json();
      if (!reportJson.hasData || !reportJson.report) {
        errors.push(`No report data for ${group.brandSlug}`);
        continue;
      }

      const { subject, html } = renderReportEmail(reportJson.report);

      // Send to each subscriber
      for (const { id, email } of group.emails) {
        try {
          await resend.emails.send({
            from: FROM_ADDRESS,
            to: email,
            subject,
            html,
          });
          await prisma.emailSubscription.update({
            where: { id },
            data: { lastSentAt: new Date() },
          });
          sent++;
        } catch (err) {
          errors.push(`Send failed to ${email}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`Error processing ${group.brandSlug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    sent,
    total: subscriptions.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
