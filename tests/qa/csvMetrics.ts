/**
 * CSV parser and metric computation for QA comparison.
 * Computes deterministic metrics from the exported Full Data CSV.
 */

import * as fs from "fs";

interface CsvRow {
  model: string;
  prompt: string;
  cluster: string;
  intent: string;
  response: string;
  date: string;
  brands: string[]; // Brand 1..5
}

export interface CsvMetrics {
  latestDate: string;
  totalRows: number;
  industryRows: number;
  dedupedIndustryRows: number;

  // Latest-snapshot industry metrics (deduped)
  brandRecall: number;
  shareOfVoice: number;
  avgPosition: number | null;
  topResultRate: number;

  // Ranking breakdown (latest snapshot, mentioned only)
  rankBreakdown: { rank1: number; rank2_3: number; rank4_5: number; rank6plus: number };

  // Per-model metrics (latest snapshot)
  byModel: Record<string, { recall: number; avgPosition: number | null; topResult: number; total: number }>;

  // Performance by question (latest snapshot)
  byQuestion: { prompt: string; models: string[]; recall: number; topResult: number; avgPosition: number | null; status: string }[];

  // Opportunity prompts (brand not mentioned)
  opportunityPrompts: string[];
  opportunityCount: number;

  // Source domains extracted from response text
  sourceDomains: { domain: string; count: number }[];
  totalSourceCitations: number;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split("\n");
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map((h) => h.toLowerCase().trim());

  const modelIdx = headers.findIndex((h) => h === "model");
  const promptIdx = headers.findIndex((h) => h === "prompt");
  const clusterIdx = headers.findIndex((h) => h === "cluster");
  const intentIdx = headers.findIndex((h) => h === "intent");
  const responseIdx = headers.findIndex((h) => h === "response");
  const dateIdx = headers.findIndex((h) => h === "date");

  const brandIdxs: number[] = [];
  for (let i = 0; i < headers.length; i++) {
    if (/^brand\s*\d+$/.test(headers[i])) brandIdxs.push(i);
  }

  const rows: CsvRow[] = [];
  // Handle multi-line CSV fields (quoted with newlines)
  let currentLine = "";
  for (let i = 1; i < lines.length; i++) {
    currentLine += (currentLine ? "\n" : "") + lines[i];
    // Count unescaped quotes — if odd, field continues to next line
    const quoteCount = (currentLine.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) continue;

    const fields = parseCSVLine(currentLine);
    currentLine = "";

    if (fields.length <= Math.max(modelIdx, promptIdx, responseIdx)) continue;

    rows.push({
      model: fields[modelIdx] ?? "",
      prompt: fields[promptIdx] ?? "",
      cluster: fields[clusterIdx] ?? "",
      intent: fields[intentIdx] ?? "",
      response: fields[responseIdx] ?? "",
      date: fields[dateIdx] ?? "",
      brands: brandIdxs.map((idx) => fields[idx] ?? "").filter((b) => b && b !== "n/a"),
    });
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function extractDomains(text: string): string[] {
  const urlRegex = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi;
  const domains = new Set<string>();
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    const domain = match[1].toLowerCase().replace(/^www\./, "");
    domains.add(domain);
  }
  return [...domains];
}

export function computeMetrics(csvPath: string, brandTerms: string[]): CsvMetrics {
  const content = fs.readFileSync(csvPath, "utf8");
  const allRows = parseCsv(content);

  const brandLower = brandTerms.map((t) => t.toLowerCase());

  function isBrandInBrands(brands: string[]): boolean {
    return brands.some((b) => brandLower.some((term) => b.toLowerCase().includes(term)));
  }

  function getBrandRank(brands: string[]): number | null {
    for (let i = 0; i < brands.length; i++) {
      if (brandLower.some((term) => brands[i].toLowerCase().includes(term))) return i + 1;
    }
    return null;
  }

  // Industry rows
  const industryRows = allRows.filter((r) => r.cluster.toLowerCase() === "industry");

  // Dedup: latest per model+prompt
  const byKey = new Map<string, CsvRow>();
  for (const r of industryRows) {
    const key = `${r.model}|${r.prompt}`;
    const existing = byKey.get(key);
    if (!existing || r.date > existing.date) byKey.set(key, r);
  }
  const deduped = [...byKey.values()];

  // Latest date
  const latestDate = deduped.reduce((max, r) => (r.date > max ? r.date : max), "");

  // Latest snapshot (within same date)
  const latestRuns = deduped.filter((r) => r.date === latestDate);
  const workingSet = latestRuns.length > 0 ? latestRuns : deduped;

  // Brand recall
  const mentionedCount = workingSet.filter((r) => isBrandInBrands(r.brands)).length;
  const brandRecall = workingSet.length > 0 ? Math.round((mentionedCount / workingSet.length) * 100) : 0;

  // Avg position
  const ranks = workingSet.map((r) => getBrandRank(r.brands)).filter((r): r is number => r !== null);
  const avgPosition = ranks.length > 0 ? Math.round((ranks.reduce((s, r) => s + r, 0) / ranks.length) * 10) / 10 : null;

  // Top result rate
  const rank1Count = ranks.filter((r) => r === 1).length;
  const topResultRate = workingSet.length > 0 ? Math.round((rank1Count / workingSet.length) * 100) : 0;

  // Share of voice
  let brandMentions = 0;
  let totalEntityMentions = 0;
  for (const r of workingSet) {
    const mentioned = isBrandInBrands(r.brands);
    if (mentioned) brandMentions++;
    totalEntityMentions += (mentioned ? 1 : 0) + r.brands.filter((b) => !brandLower.some((term) => b.toLowerCase().includes(term))).length;
  }
  const shareOfVoice = totalEntityMentions > 0 ? Math.round((brandMentions / totalEntityMentions) * 100) : 0;

  // Ranking breakdown
  const r1 = ranks.filter((r) => r === 1).length;
  const r23 = ranks.filter((r) => r >= 2 && r <= 3).length;
  const r45 = ranks.filter((r) => r >= 4 && r <= 5).length;
  const r6 = ranks.filter((r) => r >= 6).length;
  const rankTotal = ranks.length;
  const rankBreakdown = {
    rank1: rankTotal > 0 ? Math.round((r1 / rankTotal) * 100) : 0,
    rank2_3: rankTotal > 0 ? Math.round((r23 / rankTotal) * 100) : 0,
    rank4_5: rankTotal > 0 ? Math.round((r45 / rankTotal) * 100) : 0,
    rank6plus: rankTotal > 0 ? Math.round((r6 / rankTotal) * 100) : 0,
  };

  // By model
  const byModel: CsvMetrics["byModel"] = {};
  const models = [...new Set(workingSet.map((r) => r.model))];
  for (const m of models) {
    const modelRuns = workingSet.filter((r) => r.model === m);
    const mMentioned = modelRuns.filter((r) => isBrandInBrands(r.brands)).length;
    const mRanks = modelRuns.map((r) => getBrandRank(r.brands)).filter((r): r is number => r !== null);
    const mR1 = mRanks.filter((r) => r === 1).length;
    byModel[m] = {
      recall: modelRuns.length > 0 ? Math.round((mMentioned / modelRuns.length) * 100) : 0,
      avgPosition: mRanks.length > 0 ? Math.round((mRanks.reduce((s, r) => s + r, 0) / mRanks.length) * 10) / 10 : null,
      topResult: modelRuns.length > 0 ? Math.round((mR1 / modelRuns.length) * 100) : 0,
      total: modelRuns.length,
    };
  }

  // By question
  const promptGroups = new Map<string, CsvRow[]>();
  for (const r of workingSet) {
    const list = promptGroups.get(r.prompt) ?? [];
    list.push(r);
    promptGroups.set(r.prompt, list);
  }
  const byQuestion: CsvMetrics["byQuestion"] = [];
  for (const [prompt, qRuns] of promptGroups) {
    const qMentioned = qRuns.filter((r) => isBrandInBrands(r.brands)).length;
    const qRanks = qRuns.map((r) => getBrandRank(r.brands)).filter((r): r is number => r !== null);
    const qR1 = qRanks.filter((r) => r === 1).length;
    const recall = qRuns.length > 0 ? Math.round((qMentioned / qRuns.length) * 100) : 0;
    const status = qMentioned === qRuns.length ? "Win" : qMentioned === 0 ? "Missing" : "Partial";
    byQuestion.push({
      prompt,
      models: [...new Set(qRuns.map((r) => r.model))],
      recall,
      topResult: qRuns.length > 0 ? Math.round((qR1 / qRuns.length) * 100) : 0,
      avgPosition: qRanks.length > 0 ? Math.round((qRanks.reduce((s, r) => s + r, 0) / qRanks.length) * 10) / 10 : null,
      status,
    });
  }

  // Opportunity prompts
  const opportunities = byQuestion.filter((q) => q.status === "Missing").map((q) => q.prompt);

  // Source domains (from ALL rows, not just industry)
  const domainCounts = new Map<string, number>();
  for (const r of allRows) {
    const domains = extractDomains(r.response);
    for (const d of domains) {
      domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
    }
  }
  const sourceDomains = [...domainCounts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count);

  return {
    latestDate,
    totalRows: allRows.length,
    industryRows: industryRows.length,
    dedupedIndustryRows: deduped.length,
    brandRecall,
    shareOfVoice,
    avgPosition,
    topResultRate,
    rankBreakdown,
    byModel,
    byQuestion,
    opportunityPrompts: opportunities,
    opportunityCount: opportunities.length,
    sourceDomains: sourceDomains.slice(0, 25),
    totalSourceCitations: [...domainCounts.values()].reduce((s, v) => s + v, 0),
  };
}
