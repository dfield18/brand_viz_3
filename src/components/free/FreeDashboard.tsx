"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

interface FreeRunResponse {
  hasData: boolean;
  status?: "queued" | "running" | "done" | "error";
  message?: string;
  error?: string;
  /** Phase 2 will populate these */
  results?: unknown;
}

interface Props {
  showSignupCta: boolean;
  promptCount: number;
  models: string[];
}

const MODEL_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
  google: "Google AI Overviews",
};

export function FreeDashboard({ showSignupCta, promptCount, models }: Props) {
  const [brandName, setBrandName] = useState("");
  const [industry, setIndustry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FreeRunResponse | null>(null);

  const canSubmit = brandName.trim().length > 0 && industry.trim().length > 0 && !loading;
  const modelLabels = models.map((m) => MODEL_LABELS[m] ?? m).join(" + ");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/free-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: brandName.trim(),
          industry: industry.trim(),
        }),
      });
      const json: FreeRunResponse = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-6 sm:p-8 shadow-sm space-y-5">
        <div>
          <label htmlFor="brandName" className="block text-sm font-medium text-foreground mb-1.5">
            Brand name
          </label>
          <input
            id="brandName"
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="e.g. Patagonia"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-foreground/20"
            disabled={loading}
            maxLength={80}
            required
          />
        </div>

        <div>
          <label htmlFor="industry" className="block text-sm font-medium text-foreground mb-1.5">
            Industry or category
          </label>
          <input
            id="industry"
            type="text"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="e.g. outdoor apparel, project management software, electric vehicles"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-foreground/20"
            disabled={loading}
            maxLength={100}
            required
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Short category phrase — this becomes the subject of the {promptCount} questions we send to AI.
          </p>
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            {promptCount} questions &middot; {modelLabels} &middot; free
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Running…" : "Run free analysis"}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
          <h2 className="text-base font-semibold text-foreground mb-2">Result</h2>
          {result.message && (
            <p className="text-sm text-muted-foreground leading-relaxed">{result.message}</p>
          )}
          {!result.message && (
            <pre className="text-xs text-muted-foreground overflow-x-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}

      {showSignupCta && (result || error) && (
        <div className="rounded-xl border border-border/60 bg-card/60 p-6 text-center">
          <p className="text-sm font-medium text-foreground mb-1">
            Want the full report?
          </p>
          <p className="text-xs text-muted-foreground mb-4 max-w-md mx-auto leading-relaxed">
            Sign up to track all 5 AI platforms, run unlimited analyses, save historical trends, and get email reports.
          </p>
          <Link
            href="/sign-up"
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            Sign up free
          </Link>
        </div>
      )}
    </div>
  );
}
