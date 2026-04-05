import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";
import { requireAuth } from "@/lib/auth";
import { renderReportEmail } from "@/lib/email/renderReportEmail";
import { GET as getReport } from "@/app/api/report/route";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

/**
 * POST /api/reports/send-email
 *
 * Called by Vercel Cron (or manually via "Send now" button).
 *
 * Cron usage (query params):
 *   ?frequency=weekly — which subscriptions to process
 *
 * On-demand usage (POST body):
 *   { brandSlug: "xyz" } — send immediately to all subscribers for this brand
 */
export async function POST(req: NextRequest) {
  // Check for on-demand send via POST body (from UI "Send now" button)
  let onDemandBrandSlug: string | null = null;
  const contentType = req.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    try {
      const body = await req.json();
      if (body.brandSlug) onDemandBrandSlug = body.brandSlug;
    } catch { /* not JSON — cron request */ }
  }

  // Auth: on-demand requires Clerk auth, cron requires secret
  if (onDemandBrandSlug) {
    const { error: authError } = await requireAuth();
    if (authError) return authError;
  } else {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const frequency = req.nextUrl.searchParams.get("frequency") || "weekly";
  const brandSlugFilter = onDemandBrandSlug || req.nextUrl.searchParams.get("brandSlug");

  // Find subscriptions to send
  const where: Record<string, unknown> = {
    enabled: true,
  };

  if (onDemandBrandSlug) {
    const brand = await prisma.brand.findUnique({ where: { slug: onDemandBrandSlug } });
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    where.brandId = brand.id;
  } else {
    where.frequency = frequency;
    // Only send to subscribers whose preferred hour/day matches now.
    // preferredHour/Day are stored in EST (UTC-5). Convert current UTC to EST.
    const now = new Date();
    const estOffset = -5;
    const estHour = (now.getUTCHours() + estOffset + 24) % 24;
    // If EST offset pushes us to the previous day, adjust day accordingly
    const estDate = new Date(now.getTime() + estOffset * 3600_000);
    where.preferredHour = estHour;
    if (frequency === "weekly") {
      where.preferredDay = estDate.getUTCDay(); // 0=Sun..6=Sat in EST
    } else if (frequency === "monthly") {
      where.preferredDay = estDate.getUTCDate(); // 1-28 in EST
    }
    const cooldownDays = frequency === "monthly" ? 27 : frequency === "daily" ? 0.8 : 6;
    const cooldownDate = new Date(Date.now() - cooldownDays * 86_400_000);
    where.OR = [
      { lastSentAt: null },
      { lastSentAt: { lt: cooldownDate } },
    ];
    if (brandSlugFilter) {
      const brand = await prisma.brand.findUnique({ where: { slug: brandSlugFilter } });
      if (brand) where.brandId = brand.id;
    }
  }

  const subscriptions = await prisma.emailSubscription.findMany({
    where,
    include: { brand: true },
    take: 50,
  });

  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, message: "No subscriptions due" });
  }

  // Ensure every subscription has an unsubscribe token
  for (const sub of subscriptions) {
    if (!sub.unsubscribeToken) {
      const token = crypto.randomUUID();
      await prisma.emailSubscription.update({
        where: { id: sub.id },
        data: { unsubscribeToken: token },
      });
      sub.unsubscribeToken = token;
    }
  }

  // Group by brand
  const byBrand = new Map<string, { brandSlug: string; brandName: string; emails: { id: string; email: string; unsubscribeToken: string }[] }>();
  for (const sub of subscriptions) {
    const key = sub.brandId;
    if (!byBrand.has(key)) {
      byBrand.set(key, {
        brandSlug: sub.brand.slug,
        brandName: sub.brand.displayName || sub.brand.name,
        emails: [],
      });
    }
    byBrand.get(key)!.emails.push({ id: sub.id, email: sub.email, unsubscribeToken: sub.unsubscribeToken! });
  }

  let sent = 0;
  const errors: string[] = [];

  for (const [, group] of byBrand) {
    try {
      // Call the report route handler directly (bypasses Clerk proxy).
      // Set the host header to the production domain so the report route's
      // internal HTTP fetches to tab APIs reach the correct deployment.
      const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL  // e.g. "brand-viz-3-b7dn.vercel.app"
        || req.headers.get("host")
        || "localhost:3000";
      const reportUrl = new URL(`/api/report?brandSlug=${encodeURIComponent(group.brandSlug)}&model=all&range=90`, `https://${prodHost}`);
      const reportReq = new NextRequest(reportUrl, {
        headers: {
          host: prodHost,
          "x-forwarded-proto": "https",
        },
      });
      const reportRes = await getReport(reportReq);
      if (!reportRes.ok) {
        errors.push(`Report generation failed for ${group.brandSlug}: ${reportRes.status}`);
        continue;
      }
      const reportJson = await reportRes.json();

      if (!reportJson.hasData || !reportJson.report) {
        errors.push(`No report data for ${group.brandSlug}`);
        continue;
      }

      const baseUrl = `https://${prodHost}`;

      // Send to each subscriber (per-subscriber render for unique unsubscribe link)
      for (const { id, email, unsubscribeToken } of group.emails) {
        try {
          const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${unsubscribeToken}`;
          const { subject, html } = renderReportEmail(reportJson.report, unsubscribeUrl);
          await resend.emails.send({
            from: FROM_ADDRESS,
            to: email,
            subject,
            html,
            headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
          });
          await prisma.emailSubscription.update({
            where: { id },
            data: { lastSentAt: new Date() },
          });
          sent++;
        } catch (err) {
          errors.push(`Resend failed to ${email}: ${err instanceof Error ? err.message : String(err)}`);
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
