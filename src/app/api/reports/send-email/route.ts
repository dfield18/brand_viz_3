import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";
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

  // For cron requests, verify secret. On-demand requests skip this.
  if (!onDemandBrandSlug) {
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
  }

  const subscriptions = await prisma.emailSubscription.findMany({
    where,
    include: { brand: true },
    take: 50,
  });

  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, message: "No subscriptions due" });
  }

  // Group by brand
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
      // Call the report route handler directly (bypasses Clerk proxy)
      const reportReq = new NextRequest(
        new URL(`/api/report?brandSlug=${encodeURIComponent(group.brandSlug)}&model=all&range=90`, req.url),
      );
      const reportRes = await getReport(reportReq);
      if (!reportRes.ok) {
        errors.push(`Report generation failed for ${group.brandSlug}: ${reportRes.status}`);
        continue;
      }
      const reportJson = await reportRes.json();

      // Collect diagnostics for browser console
      const diag: Record<string, unknown> = {
        hasData: reportJson.hasData,
        hasReport: !!reportJson.report,
      };
      if (reportJson.report) {
        const r = reportJson.report;
        diag.brandName = r.meta?.brandName;
        diag.sections = ['overview','visibility','narrative','landscape','sources']
          .filter(k => r[k] != null);
        diag.overviewHasScorecard = !!r.overview?.scorecard;
      }

      if (!reportJson.hasData || !reportJson.report) {
        errors.push(`No report data for ${group.brandSlug}: ${JSON.stringify(diag)}`);
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
    debug: { origin: req.url, subscriptionCount: subscriptions.length },
  });
}
