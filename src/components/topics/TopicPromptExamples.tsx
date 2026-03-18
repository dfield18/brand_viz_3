"use client";

import { useState, useMemo } from "react";
import type { TopicPromptExample, TopicRow } from "@/types/api";
import { MODEL_LABELS } from "@/lib/constants";

const selectClass =
  "rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

interface Props {
  promptExamples: TopicPromptExample[];
  topics: TopicRow[];
  brandName?: string;
}

export default function TopicPromptExamples({ promptExamples, topics, brandName = "This Brand" }: Props) {
  const defaultTopic = topics[0]?.topicKey ?? "all";
  const [topic, setTopic] = useState(defaultTopic);
  const [modelFilter, setModelFilter] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [search, setSearch] = useState("");

  const topicKeys = useMemo(
    () => [...new Set(promptExamples.map((e) => e.topicKey))].sort(),
    [promptExamples],
  );
  const models = useMemo(
    () => [...new Set(promptExamples.map((e) => e.model))].sort(),
    [promptExamples],
  );

  const topicLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of promptExamples) map[e.topicKey] = e.topicLabel;
    return map;
  }, [promptExamples]);

  const filtered = useMemo(() => {
    return promptExamples.filter((e) => {
      if (topic !== "all" && e.topicKey !== topic) return false;
      if (modelFilter !== "all" && e.model !== modelFilter) return false;
      if (search && !e.promptText.toLowerCase().includes(search.toLowerCase())) return false;
      if (outcome === "win" && (e.brandRank === null || e.brandRank !== 1)) return false;
      if (outcome === "loss" && (e.brandRank === null || e.brandRank === 1)) return false;
      if (outcome === "absent" && e.brandRank !== null) return false;
      return true;
    });
  }, [promptExamples, topic, modelFilter, outcome, search]);

  const hasFilters = topic !== "all" || modelFilter !== "all" || outcome !== "all" || search !== "";

  if (promptExamples.length === 0) {
    return (
      <section className="rounded-xl bg-card p-6 shadow-section">
        <h2 className="text-base font-semibold mb-4">Example Prompts by Topic</h2>
        <p className="text-sm text-muted-foreground">No prompt examples available.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold mb-1">Example Prompts by Topic</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Underlying prompts and outcomes by topic
      </p>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className={selectClass}>
          <option value="all">All Topics</option>
          {topicKeys.map((k) => (
            <option key={k} value={k}>{topicLabelMap[k] ?? k}</option>
          ))}
        </select>
        <select value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} className={selectClass}>
          <option value="all">All Models</option>
          {models.map((m) => (
            <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
          ))}
        </select>
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={selectClass}>
          <option value="all">All Outcomes</option>
          <option value="win">Where We Win</option>
          <option value="loss">Where We Lose</option>
          <option value="absent">Where We&apos;re Absent</option>
        </select>
        <input
          type="text"
          placeholder="Search prompts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs w-44 focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground">
          {filtered.length} of {promptExamples.length} prompts
        </span>
        {hasFilters && (
          <button
            onClick={() => { setTopic("all"); setModelFilter("all"); setOutcome("all"); setSearch(""); }}
            className="text-xs text-primary hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-3 text-left font-medium text-muted-foreground min-w-[200px]">
                Prompt
              </th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground w-20">Topic</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground w-20">Model</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground w-16">{brandName} Rank</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground w-28">Top Competitor</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground w-20">Cluster</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map((e, i) => (
              <tr key={`${e.promptId}-${e.model}-${i}`} className="border-b border-border/30 hover:bg-muted/20">
                <td className="py-2 pr-3 text-foreground" title={e.promptText}>
                  <span className="line-clamp-2 leading-tight">{e.promptText}</span>
                </td>
                <td className="py-2 px-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    {e.topicLabel}
                  </span>
                </td>
                <td className="py-2 px-2 text-center">
                  {MODEL_LABELS[e.model] ?? e.model}
                </td>
                <td className="py-2 px-2 text-center tabular-nums">
                  {e.brandRank !== null ? (
                    <span className={e.brandRank === 1 ? "font-semibold text-emerald-600" : ""}>
                      #{e.brandRank}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>
                <td className="py-2 px-2">
                  {e.topCompetitor ? (
                    <span>
                      {e.topCompetitor}
                      {e.topCompetitorRank !== null && (
                        <span className="text-muted-foreground ml-1">#{e.topCompetitorRank}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>
                <td className="py-2 px-2">
                  {e.cluster && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                      {e.cluster}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No prompts match the current filters.</p>
        )}
        {filtered.length > 50 && (
          <p className="text-xs text-muted-foreground italic mt-2">
            Showing 50 of {filtered.length} matching prompts.
          </p>
        )}
      </div>
    </section>
  );
}
