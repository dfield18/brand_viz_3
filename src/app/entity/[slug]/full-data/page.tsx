"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState, useCallback } from "react";
import Link from "next/link";
import { Download, FileText, ChevronDown } from "lucide-react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { FormattedResponse } from "@/components/FormattedResponse";
import { useBrandName } from "@/lib/useBrandName";

interface RunData {
  id: string;
  model: string;
  prompt: { text: string; cluster: string; intent: string };
  rawResponseText: string;
  createdAt: string;
  cached: boolean;
  cost: { response: number; extraction: number; total: number };
}

interface ApiResponse {
  hasData: boolean;
  reason?: string;
  job?: { id: string; model: string; range: number; finishedAt: string | null };
  runs?: RunData[];
}

function FullDataInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const brandName = useBrandName(params.slug);

  const range = Number(searchParams.get("range")) || 90;
  const model = searchParams.get("model") || "all";
  const [filterModel, setFilterModel] = useState("all");

  const validModel = model === "all" || VALID_MODELS.includes(model);
  const url = validModel
    ? `/api/responses?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const { data: apiData, loading, error } = useCachedFetch<ApiResponse>(url);

  const exportCSV = useCallback((runs: RunData[]) => {
    const headers = ["Model", "Prompt", "Cluster", "Intent", "Response", "Date"];
    const rows = runs.map((r) => [
      MODEL_LABELS[r.model] ?? r.model,
      `"${r.prompt.text.replace(/"/g, '""')}"`,
      r.prompt.cluster,
      r.prompt.intent,
      `"${r.rawResponseText.replace(/"/g, '""')}"`,
      r.createdAt,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${params.slug}-full-data-${model}-${range}d.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [params.slug, model, range]);

  const exportPDF = useCallback((runs: RunData[]) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const html = `<!DOCTYPE html>
<html><head><title>${params.slug} — Full Data</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #111; font-size: 13px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
  .card { border: 1px solid #e5e5e5; border-radius: 8px; margin-bottom: 16px; overflow: hidden; page-break-inside: avoid; }
  .card-header { background: #f9fafb; padding: 12px 16px; border-bottom: 1px solid #e5e5e5; }
  .card-header p { margin: 0; font-weight: 600; font-size: 13px; }
  .tags { margin-top: 6px; }
  .tag { display: inline-block; background: #f0f0f0; padding: 2px 8px; border-radius: 12px; font-size: 11px; margin-right: 6px; }
  .model-tag { background: #dbeafe; color: #1e40af; }
  .card-body { padding: 12px 16px; line-height: 1.7; font-size: 13px; }
  .card-body h3 { font-size: 14px; font-weight: 600; margin: 12px 0 4px; }
  .card-body ul, .card-body ol { padding-left: 20px; margin: 6px 0; }
  .card-body li { margin-bottom: 4px; }
  .card-body p { margin: 6px 0; }
  @media print { body { padding: 20px; } .card { break-inside: avoid; } }
</style></head><body>
<h1>${escapeHtml(params.slug)} — Full Data</h1>
<p class="meta">${runs.length} responses · ${escapeHtml(MODEL_LABELS[model] ?? model)} · ${range}-day window</p>
${runs.map((r) => `
<div class="card">
  <div class="card-header">
    <p>${escapeHtml(r.prompt.text)}</p>
    <div class="tags">
      <span class="tag model-tag">${escapeHtml(MODEL_LABELS[r.model] ?? r.model)}</span>
      <span class="tag">${escapeHtml(r.prompt.cluster)}</span>
      <span class="tag">${escapeHtml(r.prompt.intent)}</span>
    </div>
  </div>
  <div class="card-body">${formatTextToHtml(r.rawResponseText)}</div>
</div>`).join("")}
</body></html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => printWindow.print();
  }, [params.slug, model, range]);

  // Loading
  if (loading) {
    return (
      <PageSkeleton label="Loading data...">
        <Header brandName={brandName} model={model} range={range} />
      </PageSkeleton>
    );
  }

  // Error
  if (error) {
    return (
      <div className="space-y-8">
        <Header brandName={brandName} model={model} range={range} />
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  // No data
  if (apiData && !apiData.hasData) {
    const qs = new URLSearchParams({ range: String(range), model }).toString();
    return (
      <div className="space-y-8">
        <Header brandName={brandName} model={model} range={range} />
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            No completed runs yet for{" "}
            <span className="font-medium text-foreground">{MODEL_LABELS[model] ?? model}</span>.
          </p>
          <p className="text-sm text-muted-foreground">
            Use{" "}
            <Link
              href={`/entity/${params.slug}/overview?${qs}`}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Run prompts on Overview
            </Link>{" "}
            to generate data.
          </p>
        </div>
      </div>
    );
  }

  if (!apiData?.runs) return null;
  const { runs, job } = apiData;

  const filteredRuns = filterModel === "all"
    ? runs
    : runs.filter((r) => r.model === filterModel);

  const availableModels = [...new Set(runs.map((r) => r.model))];

  return (
    <div className="space-y-8">
      <Header brandName={brandName} model={model} range={range} />

      {/* Job metadata */}
      <p className="text-xs text-muted-foreground" suppressHydrationWarning>
        {runs.length} responses &middot; {MODEL_LABELS[model] ?? model}
        {job?.finishedAt && (
          <> &middot; Completed {new Date(job.finishedAt).toLocaleString()}</>
        )}
      </p>

      {/* Toolbar: filter + export */}
      <div className="flex items-center gap-3 flex-wrap">
        {model === "all" && availableModels.length > 1 && (
          <div className="relative">
            <select
              value={filterModel}
              onChange={(e) => setFilterModel(e.target.value)}
              className="text-xs border border-border rounded-md px-2.5 py-1.5 pr-7 bg-card text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring appearance-none"
            >
              <option value="all">All Models ({runs.length})</option>
              {availableModels.map((m) => (
                <option key={m} value={m}>
                  {MODEL_LABELS[m] ?? m} ({runs.filter((r) => r.model === m).length})
                </option>
              ))}
            </select>
            <ChevronDown className="h-3 w-3 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => exportCSV(filteredRuns)}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            onClick={() => exportPDF(filteredRuns)}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Showing count */}
      {filterModel !== "all" && (
        <p className="text-xs text-muted-foreground">
          Showing {filteredRuns.length} of {runs.length} responses
        </p>
      )}

      {/* Formatted response cards */}
      <div className="space-y-6">
        {filteredRuns.map((run) => (
          <div
            key={run.id}
            className="rounded-xl border border-border bg-card overflow-hidden shadow-section"
          >
            {/* Prompt header */}
            <div className="border-b border-border bg-muted/50 px-5 py-3">
              <p className="text-sm font-medium text-foreground">
                {run.prompt.text}
              </p>
              <div className="mt-1.5 flex gap-2 flex-wrap">
                <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-950/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
                  {MODEL_LABELS[run.model] ?? run.model}
                </span>
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {run.prompt.cluster}
                </span>
                <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {run.prompt.intent}
                </span>
              </div>
            </div>

            {/* Formatted response body */}
            <div className="px-5 py-4">
              <FormattedResponse text={run.rawResponseText} brandName={brandName} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTextToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/^#{1,3}\s+(.+)$/gm, "<h3>$1</h3>")
    .replace(/^\s*[-•]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/^\s*\d+[.)]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

function Header({ brandName, model, range }: { brandName: string; model: string; range: number }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">{brandName} &mdash; Full Data</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Formatted AI responses &middot; {range}-day window &middot; {MODEL_LABELS[model] ?? model}
      </p>
    </div>
  );
}

export default function FullDataPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>}>
      <FullDataInner />
    </Suspense>
  );
}
