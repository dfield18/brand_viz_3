/**
 * Render report data into a clean HTML email.
 * Inline styles only — email clients don't support external CSS.
 */

interface ReportData {
  meta: { brandName: string; range: number; generatedAt: string };
  overview: {
    scorecard: { brandRecall: number; shareOfVoice: number; topResultRate: number; avgPosition: number };
    sentimentSplit?: { positive: number; neutral: number; negative: number } | null;
    aiSummary?: string | null;
    competitorAlerts?: { displayName: string; direction: string; recentMentionRate: number; previousMentionRate: number }[];
  };
  visibility?: {
    scorecard?: { brandRecall: number; shareOfVoice: number; avgPosition: number; topResultRate: number };
    opportunityPrompts?: { prompt: string; competitorCount: number }[];
  };
  narrative?: {
    scorecard?: { dominantNarratives?: string[]; sentimentSplit?: { positive: number; neutral: number; negative: number } };
    perceptionIssue?: { text: string } | null;
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pct(v: number): string {
  return `${Math.round(v)}%`;
}

function pos(v: number): string {
  return `#${v.toFixed(1)}`;
}

function sentimentColor(split: { positive: number; negative: number }): string {
  if (split.positive >= 60) return "#059669";
  if (split.positive >= 40) return "#d97706";
  return "#dc2626";
}

function sentimentLabel(split: { positive: number; negative: number }): string {
  if (split.positive >= 60) return "Positive";
  if (split.positive >= 40) return "Mixed";
  return "Negative";
}

export function renderReportEmail(report: ReportData, unsubscribeUrl?: string): { subject: string; html: string } {
  const { meta, overview } = report;
  const brandName = meta.brandName;
  const sc = overview?.scorecard;
  const sent = overview?.sentimentSplit;

  const subject = `${brandName} aiSaysWhat Report \u2014 ${new Date(meta.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const kpiCards = sc ? [
    { label: "Brand Recall", value: pct(sc.brandRecall), desc: "% of AI responses mentioning you" },
    { label: "Share of Voice", value: pct(sc.shareOfVoice), desc: "Your share of brand mentions" },
    { label: "Top Result Rate", value: pct(sc.topResultRate), desc: "% ranked #1" },
    { label: "Avg Position", value: pos(sc.avgPosition), desc: "Average ranking" },
  ] : [];

  // Competitor alerts
  const rising = (overview?.competitorAlerts ?? []).filter((a) => a.direction === "rising").slice(0, 3);

  // Opportunity prompts
  const opportunities = (report.visibility?.opportunityPrompts ?? []).slice(0, 3);

  // Perception issue
  const perceptionIssue = report.narrative?.perceptionIssue?.text;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="background:#111827;color:#fff;padding:24px 28px;border-radius:12px 12px 0 0;">
    <h1 style="margin:0;font-size:20px;font-weight:700;">${esc(brandName)}</h1>
    <p style="margin:6px 0 0;font-size:13px;color:#9ca3af;">aiSaysWhat Report &middot; ${meta.range}-day window &middot; ${new Date(meta.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
  </div>

  ${kpiCards.length > 0 ? `<!-- KPI Cards -->
  <div style="background:#fff;padding:24px 28px;border-left:1px solid #e5e5e5;border-right:1px solid #e5e5e5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        ${kpiCards.map((kpi) => `
        <td width="25%" style="text-align:center;padding:8px 4px;">
          <div style="font-size:24px;font-weight:700;color:#111827;">${kpi.value}</div>
          <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">${kpi.label}</div>
        </td>`).join("")}
      </tr>
    </table>
  </div>` : ""}

  ${sent ? `
  <!-- Sentiment -->
  <div style="background:#fff;padding:16px 28px;border-left:1px solid #e5e5e5;border-right:1px solid #e5e5e5;border-top:1px solid #f0f0f0;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:13px;color:#6b7280;">Overall Sentiment</td>
      <td style="text-align:right;">
        <span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;color:#fff;background:${sentimentColor(sent)};">${sentimentLabel(sent)} (${pct(sent.positive)} positive)</span>
      </td>
    </tr></table>
  </div>` : ""}

  ${overview?.aiSummary ? `
  <!-- AI Summary -->
  <div style="background:#fff;padding:20px 28px;border-left:1px solid #e5e5e5;border-right:1px solid #e5e5e5;border-top:1px solid #f0f0f0;">
    <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">${esc(overview.aiSummary).replace(/\n/g, "<br>")}</p>
  </div>` : ""}

  ${perceptionIssue ? `
  <!-- Perception Issue -->
  <div style="background:#fffbeb;padding:16px 28px;border-left:1px solid #e5e5e5;border-right:1px solid #e5e5e5;border-top:1px solid #f0f0f0;">
    <p style="margin:0;font-size:12px;font-weight:600;color:#92400e;">Perception Issue</p>
    <p style="margin:6px 0 0;font-size:13px;color:#78350f;line-height:1.5;">${esc(perceptionIssue)}</p>
  </div>` : ""}

  ${rising.length > 0 ? `
  <!-- Competitor Alerts -->
  <div style="background:#fff;padding:20px 28px;border-left:1px solid #e5e5e5;border-right:1px solid #e5e5e5;border-top:1px solid #f0f0f0;">
    <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#111827;">Rising Competitors</p>
    ${rising.map((a) => `
    <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">
      <strong style="color:#111827;">${esc(a.displayName)}</strong> &mdash; ${a.previousMentionRate}% &rarr; ${a.recentMentionRate}% mention rate
    </p>`).join("")}
  </div>` : ""}

  ${opportunities.length > 0 ? `
  <!-- Opportunities -->
  <div style="background:#fff;padding:20px 28px;border-left:1px solid #e5e5e5;border-right:1px solid #e5e5e5;border-top:1px solid #f0f0f0;">
    <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#111827;">Top Prompt Opportunities</p>
    ${opportunities.map((o) => `
    <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">
      &ldquo;${esc(o.prompt)}&rdquo; <span style="color:#9ca3af;">&mdash; ${o.competitorCount} competitor${o.competitorCount !== 1 ? "s" : ""} ranking</span>
    </p>`).join("")}
  </div>` : ""}

  <!-- Footer -->
  <div style="background:#f9fafb;padding:20px 28px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:1px solid #f0f0f0;">
    <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
      This report was generated automatically by aiSaysWhat, a service of BrooklyEcho LLC.${unsubscribeUrl ? ` <a href="${unsubscribeUrl}" style="color:#6b7280;">Unsubscribe</a>` : ""}
    </p>
  </div>

</div>
</body>
</html>`;

  return { subject, html };
}
