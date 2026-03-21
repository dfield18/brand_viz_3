"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState, useCallback } from "react";
import Link from "next/link";
import { Download, FileText, ChevronDown } from "lucide-react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { VALID_MODELS, MODEL_LABELS, CLUSTER_LABELS } from "@/lib/constants";
import { useBrandName } from "@/lib/useBrandName";
import { useCachedFetch } from "@/lib/useCachedFetch";

interface RunCost {
  response: number;
  extraction: number;
  total: number;
}

interface RunData {
  id: string;
  model: string;
  prompt: { text: string; cluster: string; intent: string };
  rawResponseText: string;
  createdAt: string;
  cached: boolean;
  cost: RunCost;
}

interface CostSummary {
  responseCost: number;
  extractionCost: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  model: string;
  note: string;
}

interface ApiResponse {
  hasData: boolean;
  reason?: string;
  job?: { id: string; model: string; range: number; finishedAt: string | null };
  runs?: RunData[];
  costs?: CostSummary;
}

function ResponsesInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const brandName = useBrandName(params.slug);

  const range = Number(searchParams.get("range")) || 90;
  const model = searchParams.get("model") || "all";
  const [filterModel, setFilterModel] = useState("all");
  const [filterCluster, setFilterCluster] = useState("all");

  const validModel = model === "all" || VALID_MODELS.includes(model);
  const url = validModel
    ? `/api/responses?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const { data: apiData, loading, error } = useCachedFetch<ApiResponse>(url);

  const exportCSV = useCallback((runs: RunData[]) => {
    const headers = ["Model", "Prompt", "Cluster", "Intent", "Response", "Date", "Cost"];
    const rows = runs.map((r) => [
      MODEL_LABELS[r.model] ?? r.model,
      `"${r.prompt.text.replace(/"/g, '""')}"`,
      r.prompt.cluster,
      r.prompt.intent,
      `"${r.rawResponseText.replace(/"/g, '""')}"`,
      r.createdAt,
      r.cost.total.toFixed(4),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${params.slug}-responses-${model}-${range}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [params.slug, model, range]);

  const exportPDF = useCallback((runs: RunData[]) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const html = `<!DOCTYPE html>
<html><head><title>${params.slug} — Responses</title>
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
  .card-body { padding: 12px 16px; white-space: pre-wrap; line-height: 1.6; font-size: 12px; }
  @media print { body { padding: 20px; } .card { break-inside: avoid; } }
</style></head><body>
<h1>${escapeHtml(params.slug)} — Responses</h1>
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
  <div class="card-body">${escapeHtml(r.rawResponseText)}</div>
</div>`).join("")}
</body></html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  }, [params.slug, model, range]);

  // Loading
  if (loading) {
    return (
      <PageSkeleton label="Loading responses...">
        <Header brandName={brandName} model={model} />
      </PageSkeleton>
    );
  }

  // Error
  if (error) {
    return (
      <div className="space-y-8">
        <Header brandName={brandName} model={model} />
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  // No completed job
  if (apiData && !apiData.hasData) {
    const qs = new URLSearchParams({ range: String(range), model }).toString();
    return (
      <div className="space-y-8">
        <Header brandName={brandName} model={model} />
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            No completed runs yet for{" "}
            <span className="font-medium text-foreground">
              {MODEL_LABELS[model] ?? model}
            </span>.
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

  // Has data — render prompt/response cards
  if (!apiData?.runs) return null;
  const { runs, job, costs } = apiData;

  // Client-side model + cluster filter (within the fetched set)
  const filteredRuns = runs.filter((r) => {
    if (filterModel !== "all" && r.model !== filterModel) return false;
    if (filterCluster !== "all" && r.prompt.cluster !== filterCluster) return false;
    return true;
  });

  const availableModels = [...new Set(runs.map((r) => r.model))];
  const availableClusters = [...new Set(runs.map((r) => r.prompt.cluster))];

  return (
    <div className="space-y-8">
      <Header brandName={brandName} model={model} />

      {/* Job metadata */}
      <p className="text-xs text-muted-foreground" suppressHydrationWarning>
        {runs.length} responses &middot; {MODEL_LABELS[model] ?? model}
        {job?.finishedAt && (
          <>
            {" "}
            &middot; Completed{" "}
            {new Date(job.finishedAt).toLocaleString()}
          </>
        )}
      </p>

      {/* Toolbar: filter + export */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Model filter (only when viewing all) */}
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

        {/* Cluster filter */}
        {availableClusters.length > 1 && (
          <div className="relative">
            <select
              value={filterCluster}
              onChange={(e) => setFilterCluster(e.target.value)}
              className="text-xs border border-border rounded-md px-2.5 py-1.5 pr-7 bg-card text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring appearance-none"
            >
              <option value="all">All Question Types ({runs.length})</option>
              {availableClusters.map((c) => (
                <option key={c} value={c}>
                  {CLUSTER_LABELS[c] ?? c} ({runs.filter((r) => r.prompt.cluster === c).length})
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

      {/* Cost summary */}
      {costs && (
        <div className="rounded-xl bg-card p-6 shadow-section">
          <h3 className="text-sm font-medium mb-3">Estimated API Costs</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Total Cost</p>
              <p className="text-lg font-semibold">${costs.totalCost.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Response Generation</p>
              <p className="text-sm font-medium">${costs.responseCost.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Analysis Extraction</p>
              <p className="text-sm font-medium">${costs.extractionCost.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Tokens</p>
              <p className="text-sm font-medium" suppressHydrationWarning>{costs.totalTokens.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground" suppressHydrationWarning>
                {costs.totalInputTokens.toLocaleString()} in / {costs.totalOutputTokens.toLocaleString()} out
              </p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">
            {costs.note}
          </p>
        </div>
      )}

      {/* Showing count */}
      {(filterModel !== "all" || filterCluster !== "all") && (
        <p className="text-xs text-muted-foreground">
          Showing {filteredRuns.length} of {runs.length} responses
        </p>
      )}

      {/* Prompt/Response cards */}
      <div className="space-y-4">
        {filteredRuns.map((run) => (
          <div key={run.id}>
            <p className="text-xs text-muted-foreground mb-1.5">
              {new Date(run.createdAt).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          <div
            className="rounded-lg bg-card overflow-hidden"
          >
            {/* Prompt header */}
            <div className="border-b border-border bg-muted/50 px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
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
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  ${run.cost.total.toFixed(4)}
                </span>
              </div>
            </div>

            {/* Response body */}
            <div className="px-5 py-4">
              <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap leading-relaxed">
                {run.rawResponseText}
              </div>
            </div>
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

function Header({ brandName, model }: { brandName: string; model: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">{brandName} &mdash; Responses</h1>
      <p className="text-sm text-muted-foreground mt-1">
        {MODEL_LABELS[model] ?? model}
      </p>
    </div>
  );
}

export default function ResponsesPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>}>
      <ResponsesInner />
    </Suspense>
  );
}
