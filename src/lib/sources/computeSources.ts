/**
 * Pure computation functions for source/citation metrics.
 * No database access — all functions take data in, return results out.
 */

import type {
  SourceSummary,
  TopDomainRow,
  SourceModelSplitRow,
  EmergingSource,
  CompetitorCrossCitation,
  OfficialSiteCitation,
} from "@/types/api";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface SourceOccurrenceInput {
  runId: string;
  promptId: string;
  model: string;
  entityId: string | null;
  domain: string;
  normalizedUrl: string;
  createdAt: Date;
}

export interface EntityMetricInput {
  runId: string;
  entityId: string;
  rankPosition: number | null;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export function computeSourceSummary(
  occurrences: SourceOccurrenceInput[],
  entityMetrics: EntityMetricInput[],
  brandEntityId: string,
  totalResponses: number,
): SourceSummary {
  const totalCitations = occurrences.length;
  const uniqueDomains = new Set(occurrences.map((o) => o.domain)).size;
  const runsWithCitations = new Set(occurrences.map((o) => o.runId)).size;
  const citationsPerResponse =
    totalResponses > 0
      ? Math.round((totalCitations / totalResponses) * 10) / 10
      : 0;
  const pctResponsesWithCitations =
    totalResponses > 0
      ? Math.round((runsWithCitations / totalResponses) * 100)
      : 0;

  // Authority drivers: domains cited in runs where brand has rank=1
  const authorityRunIds = new Set(
    entityMetrics
      .filter(
        (m) =>
          m.entityId === brandEntityId &&
          m.rankPosition === 1,
      )
      .map((m) => m.runId),
  );
  const authorityDomains = new Set(
    occurrences
      .filter((o) => authorityRunIds.has(o.runId))
      .map((o) => o.domain),
  );
  const authorityDriverCount = authorityDomains.size;

  return {
    totalCitations,
    uniqueDomains,
    citationsPerResponse,
    pctResponsesWithCitations,
    authorityDriverCount,
  };
}

// ---------------------------------------------------------------------------
// Top Domains
// ---------------------------------------------------------------------------

export function computeTopDomains(
  occurrences: SourceOccurrenceInput[],
  entityMetrics: EntityMetricInput[],
  brandEntityId: string,
  totalResponses: number,
  limit = 25,
): TopDomainRow[] {
  if (occurrences.length === 0) return [];

  // Brand metrics by runId
  const brandMetricByRun = new Map<string, EntityMetricInput>();
  for (const m of entityMetrics) {
    if (m.entityId === brandEntityId) {
      brandMetricByRun.set(m.runId, m);
    }
  }

  // Baseline averages (across all responses with brand metrics)
  const allBrandMetrics = [...brandMetricByRun.values()];
  const allBrandRanks = allBrandMetrics
    .map((m) => m.rankPosition)
    .filter((r): r is number => r !== null);
  const baselineRank =
    allBrandRanks.length > 0
      ? allBrandRanks.reduce((s, r) => s + r, 0) / allBrandRanks.length
      : 0;

  // Group by domain
  const byDomain = new Map<string, SourceOccurrenceInput[]>();
  for (const o of occurrences) {
    const arr = byDomain.get(o.domain) ?? [];
    arr.push(o);
    byDomain.set(o.domain, arr);
  }

  const rows: TopDomainRow[] = [];

  for (const [domain, domainOcc] of byDomain) {
    const citations = domainOcc.length;
    const runIds = new Set(domainOcc.map((o) => o.runId));
    const responses = runIds.size;

    // Brand metrics in runs where this domain is cited
    const citedBrandMetrics = [...runIds]
      .map((rid) => brandMetricByRun.get(rid))
      .filter((m): m is EntityMetricInput => m !== undefined);

    const citedRanks = citedBrandMetrics
      .map((m) => m.rankPosition)
      .filter((r): r is number => r !== null);

    const avgRankWhenCited =
      citedRanks.length > 0
        ? Math.round((citedRanks.reduce((s, r) => s + r, 0) / citedRanks.length) * 100) / 100
        : null;

    const rank1Count = citedRanks.filter((r) => r === 1).length;
    const rank1RateWhenCited =
      citedRanks.length > 0
        ? Math.round((rank1Count / citedRanks.length) * 100)
        : 0;

    const rankLift =
      avgRankWhenCited !== null && baselineRank > 0
        ? Math.round((avgRankWhenCited - baselineRank) * 100) / 100
        : 0;

    const dates = domainOcc.map((o) => o.createdAt.getTime());
    const firstSeen = new Date(Math.min(...dates)).toISOString().slice(0, 10);
    const lastSeen = new Date(Math.max(...dates)).toISOString().slice(0, 10);

    rows.push({
      domain,
      citations,
      responses,
      avgRankWhenCited,
      rank1RateWhenCited,
      rankLift,
      firstSeen,
      lastSeen,
    });
  }

  return rows.sort((a, b) => b.citations - a.citations).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Model Split
// ---------------------------------------------------------------------------

export function computeSourceModelSplit(
  occurrences: SourceOccurrenceInput[],
): SourceModelSplitRow[] {
  const byModel = new Map<string, Map<string, number>>();
  for (const o of occurrences) {
    const domainMap = byModel.get(o.model) ?? new Map<string, number>();
    domainMap.set(o.domain, (domainMap.get(o.domain) ?? 0) + 1);
    byModel.set(o.model, domainMap);
  }

  return [...byModel.entries()].map(([model, domainMap]) => ({
    model,
    domains: [...domainMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([domain, citations]) => ({ domain, citations })),
  }));
}

// ---------------------------------------------------------------------------
// Emerging Sources
// ---------------------------------------------------------------------------

export function detectEmergingSources(
  occurrences: SourceOccurrenceInput[],
  midpointDate: Date,
): EmergingSource[] {
  const current = occurrences.filter((o) => o.createdAt >= midpointDate);
  const previous = occurrences.filter((o) => o.createdAt < midpointDate);

  const currentByDomain = countByDomain(current);
  const previousByDomain = countByDomain(previous);

  const allDomains = new Set([...currentByDomain.keys(), ...previousByDomain.keys()]);
  const results: EmergingSource[] = [];

  for (const domain of allDomains) {
    const cur = currentByDomain.get(domain) ?? 0;
    const prev = previousByDomain.get(domain) ?? 0;

    if (cur < 2) continue;

    const growthRate = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 100;

    if (growthRate >= 25) {
      results.push({
        domain,
        currentCitations: cur,
        previousCitations: prev,
        growthRate,
      });
    }
  }

  return results.sort((a, b) => b.growthRate - a.growthRate);
}

function countByDomain(occurrences: SourceOccurrenceInput[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const o of occurrences) {
    map.set(o.domain, (map.get(o.domain) ?? 0) + 1);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Competitor Cross-Citation
// ---------------------------------------------------------------------------

export function computeCompetitorCrossCitation(
  occurrences: SourceOccurrenceInput[],
  topDomains: string[],
): CompetitorCrossCitation[] {
  const domainSet = new Set(topDomains);
  const relevant = occurrences.filter((o) => domainSet.has(o.domain));

  // Collect all known entity IDs
  const allEntityIds = new Set<string>();
  for (const o of relevant) {
    if (o.entityId) allEntityIds.add(o.entityId);
  }

  // Build a map: domain → entity for official sites
  const officialDomainToEntity = new Map<string, string>();
  for (const domain of topDomains) {
    for (const entityId of allEntityIds) {
      if (isOfficialDomain(domain, entityId)) {
        officialDomainToEntity.set(domain, entityId);
        break;
      }
    }
  }

  const byDomain = new Map<string, Map<string, number>>();
  for (const o of relevant) {
    let entityId = o.entityId;
    // For unattributed citations on official domains, assign to the matching entity
    if (!entityId && officialDomainToEntity.has(o.domain)) {
      entityId = officialDomainToEntity.get(o.domain)!;
    }
    if (!entityId) continue;

    const entityMap = byDomain.get(o.domain) ?? new Map<string, number>();
    entityMap.set(entityId, (entityMap.get(entityId) ?? 0) + 1);
    byDomain.set(o.domain, entityMap);
  }

  return topDomains
    .filter((d) => byDomain.has(d))
    .map((domain) => ({
      domain,
      entityCounts: Object.fromEntries(byDomain.get(domain)!),
    }));
}

// ---------------------------------------------------------------------------
// Domains Not Citing Brand (run-level, not attribution-level)
// ---------------------------------------------------------------------------

export interface DomainNotCitingBrand {
  domain: string;
  /** Total citations in non-brand-mentioned runs */
  citations: number;
  /** Entity attribution counts from non-brand-mentioned runs */
  competitors: [string, number][];
}

/**
 * Find domains cited in AI responses that do NOT mention the selected brand.
 *
 * Uses run-level brand mention, NOT occurrence-level entity attribution.
 * A domain is excluded from this list if it appears in ANY run where the
 * brand is mentioned — even if the occurrence is attributed to a competitor.
 *
 * @param occurrences - all source occurrences in scope
 * @param brandMentionedRunIds - set of run IDs where the brand is mentioned
 */
export function computeDomainsNotCitingBrand(
  occurrences: SourceOccurrenceInput[],
  brandMentionedRunIds: Set<string>,
): DomainNotCitingBrand[] {
  // Group occurrences by domain
  const byDomain = new Map<string, SourceOccurrenceInput[]>();
  for (const o of occurrences) {
    const list = byDomain.get(o.domain) ?? [];
    list.push(o);
    byDomain.set(o.domain, list);
  }

  const results: DomainNotCitingBrand[] = [];

  for (const [domain, domainOccs] of byDomain) {
    // Check if this domain appears in ANY brand-mentioned run
    const appearsInBrandRun = domainOccs.some((o) => brandMentionedRunIds.has(o.runId));
    if (appearsInBrandRun) continue;

    // Only include occurrences from non-brand-mentioned runs (all of them, since we passed the check)
    const entityCounts = new Map<string, number>();
    for (const o of domainOccs) {
      if (o.entityId) {
        entityCounts.set(o.entityId, (entityCounts.get(o.entityId) ?? 0) + 1);
      }
    }

    // Skip if no entity attributions at all
    if (entityCounts.size === 0) continue;

    const competitors = [...entityCounts.entries()].sort((a, b) => b[1] - a[1]);
    results.push({
      domain,
      citations: domainOccs.length,
      competitors,
    });
  }

  return results.sort((a, b) => b.citations - a.citations);
}

// ---------------------------------------------------------------------------
// Official Site Citations
// ---------------------------------------------------------------------------

/**
 * Normalise an entity name for domain matching.
 * "The North Face" → "thenorthface", "Patagonia" → "patagonia"
 */
function normaliseForDomainMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Extract the root domain from a hostname (last two labels).
 * Handles subdomains and www prefix.
 *
 *   "news.samsung.com" → "samsung.com"
 *   "www.samsung.com"  → "samsung.com"
 *   "samsung.com"      → "samsung.com"
 *   "blog.news.samsung.com" → "samsung.com"
 */
export function getRootDomain(domain: string): string {
  const base = domain.toLowerCase().replace(/^www\./, "");
  const labels = base.split(".");
  if (labels.length <= 2) return base;
  return labels.slice(-2).join(".");
}

/**
 * Extract the root label (registrable name portion) from a domain.
 *
 *   "news.samsung.com" → "samsung"
 *   "samsung.com"      → "samsung"
 *   "www.fire.org"     → "fire"
 */
export function getRootLabel(domain: string): string {
  const root = getRootDomain(domain);
  return root.split(".")[0];
}

/**
 * Check whether a domain belongs to an entity's official domain family,
 * checking against one or more candidate names.
 *
 * Uses root-domain matching so that subdomains (news.samsung.com,
 * blog.samsung.com) are recognized as part of the official family.
 *
 * For the selected brand, pass [slug, name, displayName, ...aliases].
 * For competitors, pass [entityId] or [entityId, displayName].
 */
function isOfficialDomainForCandidates(domain: string, candidates: string[]): boolean {
  const rootLabel = getRootLabel(domain);

  for (const candidate of candidates) {
    if (!candidate || candidate.length < 2) continue;
    const norm = normaliseForDomainMatch(candidate);
    if (!norm) continue;

    // Exact root-label match: "samsung" === "samsung"
    if (rootLabel === norm) return true;
    // Root label contains entity name: "patagoniaoutdoors" contains "patagonia"
    // Only for entity names with 4+ chars to avoid short-name false positives
    if (norm.length >= 4 && rootLabel.includes(norm)) return true;
    // Entity contains root label (for short domains like "rei.com"):
    // Only when root label is a significant portion of the entity name
    if (rootLabel.length >= 3 && norm.includes(rootLabel) && rootLabel.length >= norm.length * 0.6) return true;
  }

  return false;
}

/** Legacy single-candidate wrapper for backward compatibility */
function isOfficialDomain(domain: string, entityId: string): boolean {
  return isOfficialDomainForCandidates(domain, [entityId]);
}

export interface OfficialSiteBrandIdentity {
  slug: string;
  name?: string;
  displayName?: string | null;
  aliases?: string[];
}

/**
 * For each entity mentioned in source occurrences, find their official domain
 * family among all cited domains and compute citation stats.
 * Only returns entities whose official site is actually cited.
 *
 * Uses root-domain-family matching (Option B): samsung.com, www.samsung.com,
 * and news.samsung.com all count as part of Samsung's official site family.
 *
 * For the selected brand, uses all available identity candidates
 * (slug, name, displayName, aliases) so short acronym domains like
 * `fire.org` are recognized even when the slug is long.
 *
 * `officialDomain` in the result is the primary host for display.
 * `citations` is the total across the entire official domain family.
 * `officialHosts` lists all matched hostnames (for multi-host transparency).
 */
export function computeOfficialSiteCitations(
  occurrences: SourceOccurrenceInput[],
  brandSlug: string,
  brandIdentity?: OfficialSiteBrandIdentity,
): OfficialSiteCitation[] {
  // Build candidate names for the selected brand
  const brandCandidates: string[] = [brandSlug];
  if (brandIdentity) {
    if (brandIdentity.name) brandCandidates.push(brandIdentity.name);
    if (brandIdentity.displayName) brandCandidates.push(brandIdentity.displayName);
    if (brandIdentity.aliases) {
      for (const alias of brandIdentity.aliases) {
        if (alias.length >= 2) brandCandidates.push(alias);
      }
    }
  }

  // Collect all unique entityIds (including brand)
  const entityIds = new Set<string>();
  entityIds.add(brandSlug);
  for (const o of occurrences) {
    if (o.entityId) entityIds.add(o.entityId);
  }

  // Collect all unique domains
  const allDomains = [...new Set(occurrences.map((o) => o.domain))];

  const results: OfficialSiteCitation[] = [];

  for (const entityId of entityIds) {
    // For the selected brand, use multi-candidate matching
    // For competitors, use single entityId matching
    const candidates = entityId === brandSlug ? brandCandidates : [entityId];
    // officialDomains = all hostnames in the official domain family
    const officialDomains = allDomains.filter((d) => isOfficialDomainForCandidates(d, candidates));
    if (officialDomains.length === 0) continue;

    // Primary domain for display: prefer the root domain (shortest / most recognizable)
    const officialDomain = officialDomains
      .slice()
      .sort((a, b) => a.split(".").length - b.split(".").length || a.length - b.length)[0];

    // Collect citations across ALL official family domains (root + subdomains)
    const officialSet = new Set(officialDomains);
    const domainOccs = occurrences.filter((o) => officialSet.has(o.domain));
    if (domainOccs.length === 0) continue;

    const models = [...new Set(domainOccs.map((o) => o.model))];

    // Aggregate unique pages by normalizedUrl
    const pageData = new Map<string, { count: number; models: Set<string> }>();
    for (const o of domainOccs) {
      const entry = pageData.get(o.normalizedUrl) ?? { count: 0, models: new Set<string>() };
      entry.count++;
      entry.models.add(o.model);
      pageData.set(o.normalizedUrl, entry);
    }
    const pages = [...pageData.entries()]
      .map(([url, d]) => ({ url, citations: d.count, models: [...d.models] }))
      .sort((a, b) => b.citations - a.citations);

    results.push({
      entityId,
      isBrand: entityId === brandSlug,
      officialDomain,
      officialHosts: officialDomains.length > 1 ? officialDomains.sort() : undefined,
      citations: domainOccs.length,
      models,
      pages,
    });
  }

  // Sort: brand first, then by citations desc
  return results.sort((a, b) => {
    if (a.isBrand !== b.isBrand) return a.isBrand ? -1 : 1;
    return b.citations - a.citations;
  });
}
