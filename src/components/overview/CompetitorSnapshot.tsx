"use client";

import { useMemo } from "react";
import { AlertTriangle, Trophy } from "lucide-react";
import type { CompetitionResponse } from "@/types/api";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { subjectNoun } from "@/lib/subjectNoun";

interface CompetitionApiResponse {
  hasData: boolean;
  competition?: CompetitionResponse;
}

interface Props {
  brandSlug: string;
  model: string;
  range: number;
  brandCategory?: string | null;
  brandName?: string;
}

// Mirrors looksLikePersonName in src/lib/generateFeaturePrompts.ts.
// Inlined client-side so the openai-importing module stays out of the
// browser bundle. See CompetitorAlerts.tsx for the rationale.
const PERSON_NAME_SHAPE = /^[A-Z][a-zA-Z'\-]+( [A-Z][a-zA-Z'\-]+){1,3}$/;
const ORG_SIGNAL_WORDS = /\b(Foundation|Society|Union|Coalition|Alliance|Committee|Council|Association|Fund|PAC|Institute|Center|Project|Campaign|Party|Caucus|Action|Network|LLC|Inc|Corp|Co)\b/i;
function looksLikePerson(name: string | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  return PERSON_NAME_SHAPE.test(trimmed) && !ORG_SIGNAL_WORDS.test(trimmed);
}

export function CompetitorSnapshot({ brandSlug, model, range, brandCategory, brandName }: Props) {
  const noun = subjectNoun(brandName ?? "Brand", brandCategory);
  const url = `/api/competition?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}`;
  const { data: apiData, loading } = useCachedFetch<CompetitionApiResponse>(url);

  const { brand, topCompetitors, threat } = useMemo(() => {
    if (!apiData?.competition) return { brand: null, topCompetitors: [], threat: null };

    const competitors = apiData.competition.competitors;
    const winLoss = apiData.competition.winLoss;
    const brandRow = competitors.find((c) => c.isBrand) ?? null;
    const nonBrand = competitors.filter((c) => !c.isBrand);

    // Top 3 competitors by mention share
    const top = [...nonBrand]
      .sort((a, b) => b.mentionShare - a.mentionShare)
      .slice(0, 3);

    // Biggest threat — only from the competitors shown in the chart
    const wlMap = new Map(winLoss.byCompetitor.map((w) => [w.entityId, w]));
    let best: { name: string; lossRate: number; mentionShare: number; score: number } | null = null;
    for (const c of top) {
      const wl = wlMap.get(c.entityId);
      const lossRate = wl ? wl.lossRate : 0;
      const score = lossRate * 0.6 + c.mentionShare * 0.4;
      if (!best || score > best.score) {
        best = { name: c.name, lossRate, mentionShare: c.mentionShare, score };
      }
    }

    return { brand: brandRow, topCompetitors: top, threat: best?.score ? best : null };
  }, [apiData]);

  if (loading) {
    return (
      <div className="rounded-xl bg-card p-6 shadow-section animate-pulse">
        <div className="h-4 w-56 bg-muted rounded mb-4" />
        <div className="h-24 bg-muted/40 rounded" />
      </div>
    );
  }

  if (!apiData?.hasData || !apiData.competition || (!brand && topCompetitors.length === 0)) {
    return null;
  }

  // Build the ranking: brand + top competitors sorted by mention share
  const ranking = [
    ...(brand ? [brand] : []),
    ...topCompetitors,
  ].sort((a, b) => b.mentionShare - a.mentionShare);

  const maxShare = Math.max(...ranking.map((r) => r.mentionShare), 1);
  const isOrg = brandCategory === "political_advocacy";
  const isPerson = isOrg && looksLikePerson(brandName);
  // Person-shape political subjects (politicians, candidates, public
  // intellectuals) get a "public figure" noun in body copy where the
  // org default would read awkwardly ("Other organizations alongside
  // Patty Murray"). Section title still reads "Issue Landscape" for
  // both orgs and figures since they're both peer-network framings.
  const peerNoun = isPerson ? "public figure" : isOrg ? "organization" : "brand";
  const peerNounPlural = isPerson ? "public figures" : isOrg ? "organizations" : "brands";

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold">{isOrg ? "Issue Landscape" : "Competitive Landscape"}</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {isOrg
              ? `Other ${peerNounPlural} AI mentions alongside ${brandName || `this ${noun}`} in this space`
              : `How ${brandName || `this ${noun}`} stacks up against top competitors in AI responses`}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Bars show how often each name comes up compared to others in AI responses
          </p>
        </div>
      </div>

      {/* Ranking bars */}
      <div className="space-y-2.5">
        {ranking.map((row, i) => {
          const barWidth = Math.max(4, (row.mentionShare / maxShare) * 100);
          return (
            <div key={row.entityId} className="flex items-center gap-3">
              <span className="w-5 text-xs text-muted-foreground text-right tabular-nums shrink-0">
                {i + 1}.
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-sm truncate ${row.isBrand ? "font-semibold text-primary" : "font-medium"}`}>
                    {row.name}
                  </span>
                  {row.rank1Rate != null && (
                    <span className="relative group text-[10px] text-muted-foreground shrink-0 cursor-default">
                      Top result: {row.rank1Rate}%
                      <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 hidden group-hover:block w-56 rounded-lg bg-card px-3 py-2 text-[11px] font-normal text-muted-foreground leading-relaxed shadow-md z-20 text-left whitespace-normal">
                        How often AI lists this {peerNoun} first when answering industry questions.
                      </span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${row.isBrand ? "bg-primary" : "bg-sky-300"}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground text-right shrink-0">
                    {Number(row.mentionShare).toFixed(1)}% <span className="text-muted-foreground/50">share of voice</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Threat / top peer callout */}
      {threat && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2.5">
            {isOrg ? (
              <Trophy className="h-4 w-4 text-blue-500 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            )}
            <p className="text-xs text-muted-foreground">
              {isOrg ? (
                <>
                  <span className="font-semibold text-foreground">{threat.name}</span> is the most visible peer {peerNoun} in AI responses
                  {" — "}it holds <span className="font-semibold text-foreground">{Number(threat.mentionShare).toFixed(1)}%</span> share of voice
                  {threat.lossRate > 0 && (
                    <> and is ranked higher than {brandName} <span className="font-semibold text-foreground">{Number(threat.lossRate).toFixed(1)}%</span> of the time they both appear</>
                  )}
                </>
              ) : (
                <>
                  <span className="font-semibold text-foreground">{threat.name}</span> is the most visible peer brand in AI responses
                  {" — "}it holds <span className="font-semibold text-foreground">{Number(threat.mentionShare).toFixed(1)}%</span> share of voice
                  {threat.lossRate > 0 && (
                    <> and is ranked higher than {brandName} <span className="font-semibold text-foreground">{Number(threat.lossRate).toFixed(1)}%</span> of the time they both appear</>
                  )}
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
