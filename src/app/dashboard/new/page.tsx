"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PromptEditor } from "@/components/PromptEditor";
import { AnalyzeRunner } from "@/components/AnalyzeRunner";
import { dataClient } from "@/dataClient";
import { useBrands, invalidateBrands } from "@/lib/useBrands";

interface ValidationResult {
  valid: boolean;
  ambiguous: boolean;
  canonicalName: string;
  suggestion: string | null;
  category: string;
  entityType: "company" | "cause";
  alternatives: { name: string; description: string }[];
}

export default function NewBrandPage() {
  const router = useRouter();
  const { brands } = useBrands();

  const [name, setName] = useState("");
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entityType, setEntityType] = useState<"company" | "cause">("cause");

  // Steps: input → prompts → running
  const [editPromptsSlug, setEditPromptsSlug] = useState<string | null>(null);
  const [editPromptsBrandName, setEditPromptsBrandName] = useState("");
  const [runningSlug, setRunningSlug] = useState<string | null>(null);

  function proceedWithBrand(brandName: string, type?: "company" | "cause") {
    const slug = brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const existing = brands.find((b) => b.slug === slug);
    if (existing) {
      setError(`"${existing.name}" already exists.`);
      return;
    }
    const created = dataClient.createBrand({ name: brandName });
    dataClient.setLastViewedBrand(created.slug);
    if (type) setEntityType(type);
    setEditPromptsSlug(slug);
    setEditPromptsBrandName(brandName);
    setValidation(null);
  }

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    setValidation(null);

    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const existing = brands.find((b) => b.slug === slug);
    if (existing) {
      setError(`"${existing.name}" already exists.`);
      return;
    }

    setValidating(true);
    try {
      const res = await fetch("/api/validate-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const result: ValidationResult = await res.json();

      if (result.ambiguous && result.alternatives.length > 1) {
        setValidation(result);
      } else if (result.valid) {
        proceedWithBrand(result.canonicalName || trimmed, result.entityType);
      } else {
        setValidation(result);
      }
    } catch {
      proceedWithBrand(trimmed);
    } finally {
      setValidating(false);
    }
  }

  const handleAnalysisDone = useCallback((slug: string, execModel: string) => {
    invalidateBrands();
    router.push(`/entity/${slug}/overview?model=${execModel}`);
  }, [router]);

  // Step 3: Running analysis
  if (runningSlug) {
    return (
      <div className="max-w-lg mx-auto px-6 py-16">
        <h1 className="text-2xl font-bold mb-2">Analyzing Brand</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Running prompts across all AI platforms. This may take a minute.
        </p>
        <AnalyzeRunner
          brandSlug={runningSlug}
          model="all"
          range={90}
          onDone={handleAnalysisDone}
        />
      </div>
    );
  }

  // Step 2: Edit prompts before running
  if (editPromptsSlug) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-bold mb-2">Prompts for {editPromptsBrandName}</h1>
        <p className="text-sm text-muted-foreground mb-4">
          These are the questions AI platforms will be asked about <strong>{editPromptsBrandName}</strong>. You can edit, toggle, or add your own before starting the analysis.
        </p>

        {/* Entity type toggle */}
        <div className="flex items-center gap-2 mb-6 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">Detected as:</span>
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setEntityType("cause")}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                entityType === "cause"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              Cause / Advocacy
            </button>
            <button
              type="button"
              onClick={() => setEntityType("company")}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                entityType === "company"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              Company
            </button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          <PromptEditor
            brandSlug={editPromptsSlug}
            brandName={editPromptsBrandName}
            entityType={entityType}
            onStartAnalysis={() => {
              setRunningSlug(editPromptsSlug);
              setEditPromptsSlug(null);
            }}
          />
        </div>
      </div>
    );
  }

  // Step 1: Enter brand name
  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-2">Add a New Brand</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Enter a brand, organization, or campaign name to start tracking its AI visibility.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <Input
          placeholder="Organization or brand name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
            if (validation) setValidation(null);
          }}
          autoFocus
          disabled={validating}
        />

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {/* Ambiguous — multiple matches */}
        {validation && validation.ambiguous && validation.alternatives.length > 1 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2.5">
            <p className="text-sm font-medium text-blue-800">
              &ldquo;{name.trim()}&rdquo; could refer to several things. Which did you mean?
            </p>
            <div className="flex flex-col gap-1.5">
              {validation.alternatives.map((alt) => (
                <button
                  key={alt.name}
                  type="button"
                  onClick={() => {
                    setValidation(null);
                    proceedWithBrand(alt.name, validation.entityType);
                  }}
                  className="flex items-start gap-3 rounded-md border border-blue-200 bg-white px-3 py-2 text-left hover:bg-blue-100 transition-colors"
                >
                  <span className="text-sm font-medium text-foreground">{alt.name}</span>
                  <span className="text-xs text-muted-foreground">{alt.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Invalid — suggestion */}
        {validation && !validation.ambiguous && !validation.valid && (() => {
          const inputLower = name.trim().toLowerCase();
          const canonicalLower = (validation.canonicalName || "").toLowerCase();
          const hasSuggestion = validation.suggestion || (validation.canonicalName && canonicalLower !== inputLower);
          return (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-sm text-amber-800">
                {validation.suggestion
                  ? validation.suggestion
                  : hasSuggestion
                    ? `Did you mean "${validation.canonicalName}"?`
                    : `"${name.trim()}" doesn't appear to be a recognized brand or organization.`}
              </p>
              <div className="flex flex-wrap gap-2">
                {hasSuggestion && validation.canonicalName && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setValidation(null);
                      proceedWithBrand(validation.canonicalName, validation.entityType);
                    }}
                  >
                    Search for &ldquo;{validation.canonicalName}&rdquo;
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setValidation(null);
                    proceedWithBrand(name.trim(), validation.entityType);
                  }}
                >
                  Use &ldquo;{name.trim()}&rdquo; anyway
                </Button>
              </div>
            </div>
          );
        })()}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || validating || !!validation}>
            {validating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Checking...
              </>
            ) : (
              "Analyze"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
