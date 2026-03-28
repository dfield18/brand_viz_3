/**
 * Dummy visibility data for Patagonia — used for chart development/testing.
 * To revert to real API calls, remove the import and usage in the visibility page.
 */

import type { VisibilityResponse } from "@/types/api";

export const PATAGONIA_DUMMY_VISIBILITY: VisibilityResponse = {
  overallMentionRate: 73.8,
  shareOfVoice: 25,
  avgRankScore: 2.3,
  firstMentionRate: 35.5,

  kpiDeltas: {
    mentionRate: 3.5,
    shareOfVoice: 2.6,
    avgRank: -0.17,
    firstMentionRate: -1.4,
  },

  clusters: [
    { cluster: "brand", mentionRate: 91, byModel: { chatgpt: 94, gemini: 88, claude: 90, perplexity: 92, google: 0 } },
    { cluster: "brand", mentionRate: 68, byModel: { chatgpt: 72, gemini: 65, claude: 70, perplexity: 64, google: 0 } },
    { cluster: "brand", mentionRate: 78, byModel: { chatgpt: 82, gemini: 74, claude: 80, perplexity: 76, google: 0 } },
    { cluster: "brand", mentionRate: 45, byModel: { chatgpt: 50, gemini: 42, claude: 48, perplexity: 40, google: 0 } },
    { cluster: "industry", mentionRate: 72, byModel: { chatgpt: 76, gemini: 68, claude: 74, perplexity: 70, google: 0 } },
  ],

  clusterBreakdown: [
    { cluster: "brand", mentionRate: 91, avgRank: 1.2, firstMentionPct: 82 },
    { cluster: "brand", mentionRate: 68, avgRank: 2.8, firstMentionPct: 28 },
    { cluster: "brand", mentionRate: 78, avgRank: 2.1, firstMentionPct: 42 },
    { cluster: "brand", mentionRate: 45, avgRank: 3.5, firstMentionPct: 15 },
    { cluster: "industry", mentionRate: 72, avgRank: 2.14, firstMentionPct: 38.5 },
  ],

  modelBreakdown: [
    { model: "chatgpt", mentionRate: 76, avgRank: 1.9, firstMentionPct: 44, totalRuns: 48 },
    { model: "gemini", mentionRate: 68, avgRank: 2.4, firstMentionPct: 32, totalRuns: 48 },
    { model: "claude", mentionRate: 74, avgRank: 2.0, firstMentionPct: 40, totalRuns: 48 },
    { model: "perplexity", mentionRate: 70, avgRank: 2.3, firstMentionPct: 36, totalRuns: 48 },
  ],

  topPromptWins: [
    { prompt: "What is the most sustainable outdoor clothing brand?", rank: 1, cluster: "industry" },
    { prompt: "Best brands for ethical outdoor gear", rank: 1, cluster: "industry" },
    { prompt: "Which outdoor brand has the strongest environmental commitment?", rank: 1, cluster: "industry" },
    { prompt: "Top brands for recycled fabric outdoor jackets", rank: 1, cluster: "industry" },
    { prompt: "Most trusted outdoor apparel brands for hiking", rank: 1, cluster: "industry" },
    { prompt: "What brand should I buy for sustainable down jackets?", rank: 1, cluster: "industry" },
    { prompt: "Best outdoor clothing companies for environmental activism", rank: 1, cluster: "industry" },
    { prompt: "Which companies lead in fair trade outdoor clothing?", rank: 1, cluster: "industry" },
  ],

  worstPerformingPrompts: [
    { prompt: "Cheapest outdoor jackets under $100", rank: null, competitors: ["Columbia", "The North Face", "REI Co-op", "Marmot"] },
    { prompt: "Best budget hiking pants for beginners", rank: null, competitors: ["REI Co-op", "Columbia", "The North Face"] },
    { prompt: "Most affordable waterproof rain gear", rank: null, competitors: ["Columbia", "Marmot", "The North Face", "REI Co-op", "L.L.Bean"] },
    { prompt: "Best value outdoor clothing brands", rank: 5, competitors: ["The North Face", "Columbia", "REI Co-op", "L.L.Bean", "Marmot"] },
    { prompt: "Top outdoor brands for casual everyday wear", rank: 4, competitors: ["The North Face", "Arc'teryx", "Columbia", "L.L.Bean"] },
    { prompt: "Best running gear brands for trail running", rank: 4, competitors: ["Salomon", "The North Face", "Arc'teryx"] },
    { prompt: "Which outdoor brand has the best warranty?", rank: 3, competitors: ["L.L.Bean", "REI Co-op", "The North Face"] },
    { prompt: "Most fashionable outdoor brands for urban wear", rank: 4, competitors: ["Arc'teryx", "The North Face", "Columbia"] },
    { prompt: "Best lightweight backpacking gear brands", rank: 3, competitors: ["Osprey", "Arc'teryx", "REI Co-op", "The North Face"] },
    { prompt: "Top brands for winter ski clothing", rank: 3, competitors: ["Arc'teryx", "The North Face", "Salomon", "Columbia", "Marmot"] },
    { prompt: "Best outdoor footwear brands", rank: null, competitors: ["Merrell", "Salomon", "The North Face", "Columbia"] },
    { prompt: "Most innovative outdoor gear companies", rank: 3, competitors: ["Arc'teryx", "The North Face", "Salomon"] },
  ],

  trend: (() => {
    const points: { date: string; model: string; prompt: string; mentionRate: number; avgPosition: number; firstMentionPct: number; sovPct: number }[] = [];
    const WEEKS = 16;
    const now = new Date();
    const base = new Date(now);
    base.setDate(base.getDate() - (WEEKS - 1) * 7);
    const models = ["all", "chatgpt", "gemini", "claude", "perplexity"];
    const modelOffsets: Record<string, number> = { all: 0, chatgpt: 3, gemini: -2, claude: 1, perplexity: -1 };
    const promptTexts = [
      "Best sustainable outdoor clothing brands",
      "Most ethical outdoor apparel companies",
      "Top outdoor brands for hiking gear",
      "Best winter jackets for extreme cold",
      "Best outdoor brands for recycled materials",
      "Cheapest outdoor jackets under $100",
      "Best outdoor brands for trail running",
    ];
    const promptOffsets = [5, 8, -2, -5, 10, -15, -8];
    for (let i = 0; i < WEEKS; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i * 7);
      const date = d.toISOString().slice(0, 10);
      for (const m of models) {
        const offset = modelOffsets[m];
        const noise = Math.sin(i * 0.8 + offset) * 6;
        const mr = Math.round((65 + offset + i * 0.8 + noise) * 10) / 10;
        const ap = Math.round((2.8 + offset * 0.1 - i * 0.04 + Math.cos(i * 0.5) * 0.3) * 100) / 100;
        const fm = Math.round((30 + offset + i * 0.6 + Math.sin(i * 0.7) * 4) * 10) / 10;
        const sov = Math.round((18 + offset * 0.5 + i * 0.3 + Math.sin(i * 0.9 + offset) * 3) * 10) / 10;
        // Aggregate "all prompts" point
        points.push({
          date,
          model: m,
          prompt: "all",
          mentionRate: Math.max(0, Math.min(100, mr)),
          avgPosition: Math.max(1, ap),
          firstMentionPct: Math.max(0, Math.min(100, fm)),
          sovPct: Math.max(0, Math.min(100, sov)),
        });
        // Per-prompt points
        for (let p = 0; p < promptTexts.length; p++) {
          const po = promptOffsets[p];
          const pNoise = Math.sin(i * 0.6 + offset + p) * 8;
          const pMr = Math.round((65 + offset + po + i * 0.7 + pNoise) * 10) / 10;
          const pAp = Math.round((2.5 + offset * 0.1 + po * 0.05 - i * 0.03 + Math.cos(i * 0.4 + p) * 0.4) * 100) / 100;
          const pFm = Math.round((30 + offset + po * 0.5 + i * 0.5 + Math.sin(i * 0.6 + p) * 5) * 10) / 10;
          const pSov = Math.round((18 + offset * 0.5 + po * 0.3 + i * 0.25 + Math.sin(i * 0.7 + p + offset) * 4) * 10) / 10;
          points.push({
            date,
            model: m,
            prompt: promptTexts[p],
            mentionRate: Math.max(0, Math.min(100, pMr)),
            avgPosition: Math.max(1, pAp),
            firstMentionPct: Math.max(0, Math.min(100, pFm)),
            sovPct: Math.max(0, Math.min(100, pSov)),
          });
        }
      }
    }
    return points;
  })(),

  rankDistribution: [
    { rank: 1, count: 74, percentage: 38.5 },
    { rank: 2, count: 52, percentage: 27.1 },
    { rank: 3, count: 35, percentage: 18.2 },
    { rank: 4, count: 18, percentage: 9.4 },
    { rank: 5, count: 8, percentage: 4.2 },
    { rank: 6, count: 3, percentage: 1.6 },
    { rank: 7, count: 2, percentage: 1.0 },
  ],

  intentSplit: [
    { intent: "high-intent", percentage: 78 },
    { intent: "informational", percentage: 68 },
  ],

  visibilityRanking: [
    { entityId: "the-north-face", name: "The North Face", score: 82, isBrand: false },
    { entityId: "patagonia", name: "Patagonia", score: 72, isBrand: true },
    { entityId: "arcteryx", name: "Arc'teryx", score: 68, isBrand: false },
    { entityId: "rei-co-op", name: "REI Co-op", score: 55, isBrand: false },
    { entityId: "columbia", name: "Columbia", score: 48, isBrand: false },
    { entityId: "osprey", name: "Osprey", score: 35, isBrand: false },
    { entityId: "salomon", name: "Salomon", score: 30, isBrand: false },
    { entityId: "merrell", name: "Merrell", score: 25, isBrand: false },
    { entityId: "llbean", name: "L.L.Bean", score: 22, isBrand: false },
    { entityId: "marmot", name: "Marmot", score: 18, isBrand: false },
  ],

  positionDistribution: [
    // All models
    { position: 1, model: "all", count: 74, percentage: 38 },
    { position: 2, model: "all", count: 52, percentage: 27 },
    { position: 3, model: "all", count: 35, percentage: 18 },
    { position: 4, model: "all", count: 18, percentage: 9 },
    { position: 5, model: "all", count: 8, percentage: 4 },
    { position: 6, model: "all", count: 3, percentage: 2 },
    { position: 7, model: "all", count: 2, percentage: 1 },
    // ChatGPT
    { position: 1, model: "chatgpt", count: 22, percentage: 44 },
    { position: 2, model: "chatgpt", count: 14, percentage: 28 },
    { position: 3, model: "chatgpt", count: 8, percentage: 16 },
    { position: 4, model: "chatgpt", count: 4, percentage: 8 },
    { position: 5, model: "chatgpt", count: 2, percentage: 4 },
    // Gemini
    { position: 1, model: "gemini", count: 16, percentage: 33 },
    { position: 2, model: "gemini", count: 14, percentage: 29 },
    { position: 3, model: "gemini", count: 10, percentage: 21 },
    { position: 4, model: "gemini", count: 5, percentage: 10 },
    { position: 5, model: "gemini", count: 3, percentage: 6 },
    // Claude
    { position: 1, model: "claude", count: 20, percentage: 42 },
    { position: 2, model: "claude", count: 13, percentage: 27 },
    { position: 3, model: "claude", count: 9, percentage: 19 },
    { position: 4, model: "claude", count: 4, percentage: 8 },
    { position: 5, model: "claude", count: 2, percentage: 4 },
    // Perplexity
    { position: 1, model: "perplexity", count: 16, percentage: 34 },
    { position: 2, model: "perplexity", count: 11, percentage: 23 },
    { position: 3, model: "perplexity", count: 8, percentage: 17 },
    { position: 4, model: "perplexity", count: 5, percentage: 11 },
    { position: 5, model: "perplexity", count: 3, percentage: 6 },
    { position: 6, model: "perplexity", count: 3, percentage: 6 },
    { position: 7, model: "perplexity", count: 2, percentage: 4 },
  ],

  positionDistributionOverTime: (() => {
    const rows: { date: string; model: string; pos1: number; pos2_3: number; pos4_5: number; pos6plus: number }[] = [];
    const WEEKS = 16;
    const now = new Date();
    const base = new Date(now);
    base.setDate(base.getDate() - (WEEKS - 1) * 7);
    const models = ["all", "chatgpt", "gemini", "claude", "perplexity"];
    const modelOffsets: Record<string, number> = { all: 0, chatgpt: 4, gemini: -3, claude: 2, perplexity: -2 };
    for (let i = 0; i < WEEKS; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i * 7);
      const date = d.toISOString().slice(0, 10);
      const t = i / (WEEKS - 1); // 0→1 over time
      for (const m of models) {
        const off = modelOffsets[m];
        const noise = Math.sin(i * 0.9 + off) * 2;
        const p1 = Math.round(30 + t * 22 + off * 0.5 + noise);       // 30→52%
        const p23 = Math.round(45 - t * 12 + noise * 0.5);            // 45→33%
        const p45 = Math.round(15 - t * 5 + Math.sin(i) * 1.5);      // 15→10%
        const raw6 = 100 - p1 - p23 - p45;                            // remainder
        rows.push({
          date, model: m,
          pos1: Math.max(0, Math.min(100, p1)),
          pos2_3: Math.max(0, Math.min(100, p23)),
          pos4_5: Math.max(0, Math.min(100, p45)),
          pos6plus: Math.max(0, Math.min(100, raw6)),
        });
      }
    }
    return rows;
  })(),

  resultsByQuestion: [
    { promptText: "Best sustainable outdoor clothing brands", model: "chatgpt", aiVisibility: 100, shareOfVoice: 28, firstPosition: 67, avgPosition: 1.5, avgSentiment: "Strong" },
    { promptText: "Best sustainable outdoor clothing brands", model: "gemini", aiVisibility: 100, shareOfVoice: 22, firstPosition: 50, avgPosition: 2.0, avgSentiment: "Positive" },
    { promptText: "Best sustainable outdoor clothing brands", model: "claude", aiVisibility: 100, shareOfVoice: 25, firstPosition: 67, avgPosition: 1.3, avgSentiment: "Strong" },
    { promptText: "Best sustainable outdoor clothing brands", model: "perplexity", aiVisibility: 100, shareOfVoice: 20, firstPosition: 50, avgPosition: 1.8, avgSentiment: "Positive" },
    { promptText: "Most ethical outdoor apparel companies", model: "chatgpt", aiVisibility: 100, shareOfVoice: 32, firstPosition: 100, avgPosition: 1.0, avgSentiment: "Strong" },
    { promptText: "Most ethical outdoor apparel companies", model: "gemini", aiVisibility: 100, shareOfVoice: 26, firstPosition: 50, avgPosition: 1.5, avgSentiment: "Strong" },
    { promptText: "Most ethical outdoor apparel companies", model: "claude", aiVisibility: 100, shareOfVoice: 30, firstPosition: 100, avgPosition: 1.0, avgSentiment: "Strong" },
    { promptText: "Most ethical outdoor apparel companies", model: "perplexity", aiVisibility: 100, shareOfVoice: 24, firstPosition: 50, avgPosition: 2.0, avgSentiment: "Positive" },
    { promptText: "Top outdoor brands for hiking gear", model: "chatgpt", aiVisibility: 83, shareOfVoice: 15, firstPosition: 33, avgPosition: 2.5, avgSentiment: "Positive" },
    { promptText: "Top outdoor brands for hiking gear", model: "gemini", aiVisibility: 67, shareOfVoice: 12, firstPosition: 17, avgPosition: 3.2, avgSentiment: "Neutral" },
    { promptText: "Top outdoor brands for hiking gear", model: "claude", aiVisibility: 83, shareOfVoice: 18, firstPosition: 33, avgPosition: 2.1, avgSentiment: "Positive" },
    { promptText: "Top outdoor brands for hiking gear", model: "perplexity", aiVisibility: 67, shareOfVoice: 10, firstPosition: 0, avgPosition: 3.5, avgSentiment: "Neutral" },
    { promptText: "Best winter jackets for extreme cold", model: "chatgpt", aiVisibility: 67, shareOfVoice: 10, firstPosition: 17, avgPosition: 3.0, avgSentiment: "Neutral" },
    { promptText: "Best winter jackets for extreme cold", model: "gemini", aiVisibility: 50, shareOfVoice: 8, firstPosition: 0, avgPosition: 3.8, avgSentiment: "Neutral" },
    { promptText: "Best winter jackets for extreme cold", model: "claude", aiVisibility: 67, shareOfVoice: 12, firstPosition: 17, avgPosition: 2.8, avgSentiment: "Positive" },
    { promptText: "Best winter jackets for extreme cold", model: "perplexity", aiVisibility: 50, shareOfVoice: 8, firstPosition: 0, avgPosition: 4.0, avgSentiment: "Neutral" },
    { promptText: "Best outdoor brands for recycled materials", model: "chatgpt", aiVisibility: 100, shareOfVoice: 35, firstPosition: 83, avgPosition: 1.2, avgSentiment: "Strong" },
    { promptText: "Best outdoor brands for recycled materials", model: "gemini", aiVisibility: 100, shareOfVoice: 30, firstPosition: 67, avgPosition: 1.5, avgSentiment: "Strong" },
    { promptText: "Best outdoor brands for recycled materials", model: "claude", aiVisibility: 100, shareOfVoice: 33, firstPosition: 83, avgPosition: 1.2, avgSentiment: "Strong" },
    { promptText: "Best outdoor brands for recycled materials", model: "perplexity", aiVisibility: 100, shareOfVoice: 28, firstPosition: 67, avgPosition: 1.8, avgSentiment: "Positive" },
    { promptText: "Cheapest outdoor jackets under $100", model: "chatgpt", aiVisibility: 17, shareOfVoice: 3, firstPosition: 0, avgPosition: 5.0, avgSentiment: "Neutral" },
    { promptText: "Cheapest outdoor jackets under $100", model: "gemini", aiVisibility: 0, shareOfVoice: 0, firstPosition: 0, avgPosition: null, avgSentiment: "Neutral" },
    { promptText: "Cheapest outdoor jackets under $100", model: "claude", aiVisibility: 17, shareOfVoice: 4, firstPosition: 0, avgPosition: 4.5, avgSentiment: "Neutral" },
    { promptText: "Cheapest outdoor jackets under $100", model: "perplexity", aiVisibility: 0, shareOfVoice: 0, firstPosition: 0, avgPosition: null, avgSentiment: "Neutral" },
    { promptText: "Best outdoor brands for trail running", model: "chatgpt", aiVisibility: 50, shareOfVoice: 8, firstPosition: 0, avgPosition: 4.0, avgSentiment: "Neutral" },
    { promptText: "Best outdoor brands for trail running", model: "gemini", aiVisibility: 33, shareOfVoice: 5, firstPosition: 0, avgPosition: 4.5, avgSentiment: "Neutral" },
    { promptText: "Best outdoor brands for trail running", model: "claude", aiVisibility: 50, shareOfVoice: 10, firstPosition: 0, avgPosition: 3.5, avgSentiment: "Neutral" },
    { promptText: "Best outdoor brands for trail running", model: "perplexity", aiVisibility: 33, shareOfVoice: 6, firstPosition: 0, avgPosition: 4.0, avgSentiment: "Negative" },
  ],

  opportunityPrompts: [
    { prompt: "Best outdoor brands for ultralight camping gear", competitorCount: 5, competitors: ["Arc'teryx", "The North Face", "Osprey", "REI Co-op", "Salomon"] },
    { prompt: "Top climbing apparel companies", competitorCount: 4, competitors: ["Arc'teryx", "The North Face", "Salomon", "Columbia"] },
    { prompt: "Best outdoor gear for kids and families", competitorCount: 4, competitors: ["REI Co-op", "Columbia", "The North Face", "L.L.Bean"] },
    { prompt: "Which brands make the best fleece jackets?", competitorCount: 3, competitors: ["The North Face", "Columbia", "Arc'teryx"] },
    { prompt: "Most durable outdoor workwear brands", competitorCount: 3, competitors: ["Columbia", "L.L.Bean", "Marmot"] },
    { prompt: "Best outdoor brands for fishing gear", competitorCount: 3, competitors: ["Columbia", "Simms", "Orvis"] },
    { prompt: "Top brands for waterproof hiking boots", competitorCount: 2, competitors: ["Merrell", "Salomon"] },
    { prompt: "Best outdoor gear for extreme cold weather", competitorCount: 2, competitors: ["Arc'teryx", "The North Face"] },
  ],

  promptPositions: [
    { promptText: "Best sustainable outdoor clothing brands", model: "chatgpt", position: 1 },
    { promptText: "Best sustainable outdoor clothing brands", model: "gemini", position: 2 },
    { promptText: "Best sustainable outdoor clothing brands", model: "claude", position: 1 },
    { promptText: "Best sustainable outdoor clothing brands", model: "perplexity", position: 1 },
    { promptText: "Top eco-friendly jacket brands", model: "chatgpt", position: 1 },
    { promptText: "Top eco-friendly jacket brands", model: "gemini", position: 1 },
    { promptText: "Top eco-friendly jacket brands", model: "claude", position: 2 },
    { promptText: "Top eco-friendly jacket brands", model: "perplexity", position: 2 },
    { promptText: "Best outdoor brands for recycled materials", model: "chatgpt", position: 1 },
    { promptText: "Best outdoor brands for recycled materials", model: "gemini", position: 2 },
    { promptText: "Best outdoor brands for recycled materials", model: "claude", position: 1 },
    { promptText: "Best outdoor brands for recycled materials", model: "perplexity", position: 2 },
    { promptText: "Cheapest outdoor jackets under $100", model: "chatgpt", position: 5 },
    { promptText: "Cheapest outdoor jackets under $100", model: "gemini", position: null },
    { promptText: "Cheapest outdoor jackets under $100", model: "claude", position: 5 },
    { promptText: "Cheapest outdoor jackets under $100", model: "perplexity", position: null },
    { promptText: "Best outdoor brands for trail running", model: "chatgpt", position: 4 },
    { promptText: "Best outdoor brands for trail running", model: "gemini", position: 5 },
    { promptText: "Best outdoor brands for trail running", model: "claude", position: 4 },
    { promptText: "Best outdoor brands for trail running", model: "perplexity", position: 4 },
  ],
};

export const PATAGONIA_DUMMY_TOTALS = {
  totalRuns: 192,
  totalMentions: 139,
};

export const PATAGONIA_DUMMY_JOB = {
  id: "dummy-patagonia-job",
  model: "all",
  range: 90,
  finishedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Nuclear Energy dummy data
// ---------------------------------------------------------------------------

export const NUCLEAR_ENERGY_DUMMY_VISIBILITY: VisibilityResponse = {
  overallMentionRate: 90.8,
  shareOfVoice: 30,
  avgRankScore: 1.73,
  firstMentionRate: 51.6,

  kpiDeltas: {
    mentionRate: 3.6,
    shareOfVoice: -1.1,
    avgRank: 0.12,
    firstMentionRate: 0.9,
  },

  clusters: [
    { cluster: "brand", mentionRate: 95, byModel: { chatgpt: 97, gemini: 92, claude: 96, perplexity: 94, google: 0 } },
    { cluster: "brand", mentionRate: 82, byModel: { chatgpt: 85, gemini: 78, claude: 84, perplexity: 80, google: 0 } },
    { cluster: "brand", mentionRate: 88, byModel: { chatgpt: 90, gemini: 84, claude: 89, perplexity: 87, google: 0 } },
    { cluster: "brand", mentionRate: 62, byModel: { chatgpt: 68, gemini: 58, claude: 64, perplexity: 60, google: 0 } },
    { cluster: "industry", mentionRate: 85, byModel: { chatgpt: 88, gemini: 80, claude: 86, perplexity: 84, google: 0 } },
  ],

  clusterBreakdown: [
    { cluster: "brand", mentionRate: 95, avgRank: 1.1, firstMentionPct: 88 },
    { cluster: "brand", mentionRate: 82, avgRank: 2.0, firstMentionPct: 45 },
    { cluster: "brand", mentionRate: 88, avgRank: 1.6, firstMentionPct: 58 },
    { cluster: "brand", mentionRate: 62, avgRank: 2.9, firstMentionPct: 22 },
    { cluster: "industry", mentionRate: 85, avgRank: 1.78, firstMentionPct: 52.3 },
  ],

  modelBreakdown: [
    { model: "chatgpt", mentionRate: 88, avgRank: 1.6, firstMentionPct: 58, totalRuns: 60 },
    { model: "gemini", mentionRate: 80, avgRank: 2.0, firstMentionPct: 44, totalRuns: 60 },
    { model: "claude", mentionRate: 86, avgRank: 1.7, firstMentionPct: 54, totalRuns: 60 },
    { model: "perplexity", mentionRate: 84, avgRank: 1.9, firstMentionPct: 50, totalRuns: 60 },
  ],

  topPromptWins: [
    { prompt: "What is the most reliable source of clean energy?", rank: 1, cluster: "industry" },
    { prompt: "Best low-carbon energy sources for baseload power", rank: 1, cluster: "industry" },
    { prompt: "Which energy source produces the least greenhouse gas emissions?", rank: 1, cluster: "industry" },
    { prompt: "Most energy-dense fuel sources available today", rank: 1, cluster: "industry" },
    { prompt: "What energy source has the highest capacity factor?", rank: 1, cluster: "industry" },
    { prompt: "Best zero-emission power generation technologies", rank: 1, cluster: "industry" },
    { prompt: "Which power sources can run 24/7 without intermittency?", rank: 1, cluster: "industry" },
    { prompt: "Safest energy sources by deaths per TWh", rank: 1, cluster: "industry" },
    { prompt: "What is the best energy source for decarbonizing the grid?", rank: 1, cluster: "industry" },
    { prompt: "Most land-efficient energy generation methods", rank: 1, cluster: "industry" },
  ],

  worstPerformingPrompts: [
    { prompt: "Cheapest energy sources for developing countries", rank: null, competitors: ["Solar", "Wind", "Natural Gas", "Coal"] },
    { prompt: "Best energy sources for remote off-grid communities", rank: null, competitors: ["Solar", "Wind", "Diesel Generators", "Micro-Hydro"] },
    { prompt: "Fastest energy sources to deploy at scale", rank: null, competitors: ["Solar", "Wind", "Natural Gas"] },
    { prompt: "Most popular residential energy options", rank: 5, competitors: ["Solar", "Natural Gas", "Heat Pumps", "Wind", "Geothermal"] },
    { prompt: "Best renewable energy investments for 2025", rank: 4, competitors: ["Solar", "Wind", "Green Hydrogen", "Battery Storage"] },
    { prompt: "Which energy sources have the lowest upfront cost?", rank: 5, competitors: ["Natural Gas", "Solar", "Wind", "Coal", "Geothermal"] },
    { prompt: "Top energy sources for small businesses", rank: 4, competitors: ["Solar", "Natural Gas", "Wind"] },
    { prompt: "Best energy options for tropical island nations", rank: null, competitors: ["Solar", "Wind", "Ocean Thermal", "Geothermal"] },
    { prompt: "Most environmentally friendly energy sources", rank: 3, competitors: ["Solar", "Wind"] },
    { prompt: "Which energy sources are growing fastest globally?", rank: 3, competitors: ["Solar", "Wind", "Battery Storage"] },
    { prompt: "Best community-scale energy solutions", rank: null, competitors: ["Solar", "Wind", "Micro-Hydro", "Biomass"] },
    { prompt: "Top energy sources for home heating", rank: 4, competitors: ["Heat Pumps", "Natural Gas", "Solar Thermal"] },
    { prompt: "Which energy technologies have the most public support?", rank: 3, competitors: ["Solar", "Wind"] },
    { prompt: "Best portable energy solutions for camping", rank: null, competitors: ["Solar Panels", "Portable Batteries", "Propane"] },
  ],

  trend: (() => {
    const points: { date: string; model: string; prompt: string; mentionRate: number; avgPosition: number; firstMentionPct: number; sovPct: number }[] = [];
    const WEEKS = 20;
    const now = new Date();
    const base = new Date(now);
    base.setDate(base.getDate() - (WEEKS - 1) * 7);
    const models = ["all", "chatgpt", "gemini", "claude", "perplexity"];
    const modelOffsets: Record<string, number> = { all: 0, chatgpt: 4, gemini: -3, claude: 2, perplexity: -1 };
    const promptTexts = [
      "What is the most reliable source of clean energy?",
      "Best low-carbon energy sources for baseload power",
      "Which energy source produces the least greenhouse gas emissions?",
      "What are the pros and cons of nuclear power?",
      "Which power sources can run 24/7 without intermittency?",
      "Cheapest energy sources for developing countries",
      "Best renewable energy investments for 2025",
    ];
    const promptOffsets = [6, 10, 3, -3, 8, -18, -10];
    for (let i = 0; i < WEEKS; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i * 7);
      const date = d.toISOString().slice(0, 10);
      for (const m of models) {
        const offset = modelOffsets[m];
        const noise = Math.sin(i * 0.7 + offset) * 5;
        const mr = Math.round((78 + offset + i * 0.5 + noise) * 10) / 10;
        const ap = Math.round((2.2 + offset * 0.08 - i * 0.03 + Math.cos(i * 0.6) * 0.25) * 100) / 100;
        const fm = Math.round((42 + offset + i * 0.7 + Math.sin(i * 0.6) * 4) * 10) / 10;
        const sov = Math.round((22 + offset * 0.4 + i * 0.35 + Math.sin(i * 0.8 + offset) * 3) * 10) / 10;
        // Aggregate "all prompts" point
        points.push({
          date,
          model: m,
          prompt: "all",
          mentionRate: Math.max(0, Math.min(100, mr)),
          avgPosition: Math.max(1, ap),
          firstMentionPct: Math.max(0, Math.min(100, fm)),
          sovPct: Math.max(0, Math.min(100, sov)),
        });
        // Per-prompt points
        for (let p = 0; p < promptTexts.length; p++) {
          const po = promptOffsets[p];
          const pNoise = Math.sin(i * 0.6 + offset + p) * 8;
          const pMr = Math.round((78 + offset + po + i * 0.5 + pNoise) * 10) / 10;
          const pAp = Math.round((2.2 + offset * 0.08 + po * 0.05 - i * 0.03 + Math.cos(i * 0.4 + p) * 0.4) * 100) / 100;
          const pFm = Math.round((42 + offset + po * 0.5 + i * 0.5 + Math.sin(i * 0.6 + p) * 5) * 10) / 10;
          const pSov = Math.round((22 + offset * 0.4 + po * 0.25 + i * 0.3 + Math.sin(i * 0.7 + p + offset) * 4) * 10) / 10;
          points.push({
            date,
            model: m,
            prompt: promptTexts[p],
            mentionRate: Math.max(0, Math.min(100, pMr)),
            avgPosition: Math.max(1, pAp),
            firstMentionPct: Math.max(0, Math.min(100, pFm)),
            sovPct: Math.max(0, Math.min(100, pSov)),
          });
        }
      }
    }
    return points;
  })(),

  rankDistribution: [
    { rank: 1, count: 125, percentage: 52.3 },
    { rank: 2, count: 62, percentage: 25.9 },
    { rank: 3, count: 30, percentage: 12.5 },
    { rank: 4, count: 14, percentage: 5.8 },
    { rank: 5, count: 5, percentage: 2.1 },
    { rank: 6, count: 3, percentage: 1.3 },
  ],

  intentSplit: [
    { intent: "high-intent", percentage: 82 },
    { intent: "informational", percentage: 88 },
  ],

  visibilityRanking: [
    { entityId: "nuclear-energy", name: "Nuclear Energy", score: 85, isBrand: true },
    { entityId: "solar", name: "Solar", score: 92, isBrand: false },
    { entityId: "wind", name: "Wind", score: 78, isBrand: false },
    { entityId: "natural-gas", name: "Natural Gas", score: 65, isBrand: false },
    { entityId: "hydroelectric", name: "Hydroelectric", score: 52, isBrand: false },
    { entityId: "geothermal", name: "Geothermal", score: 38, isBrand: false },
    { entityId: "coal", name: "Coal", score: 35, isBrand: false },
    { entityId: "hydrogen", name: "Green Hydrogen", score: 30, isBrand: false },
    { entityId: "biomass", name: "Biomass", score: 22, isBrand: false },
    { entityId: "tidal", name: "Tidal", score: 12, isBrand: false },
  ],

  positionDistribution: [
    // All models
    { position: 1, model: "all", count: 125, percentage: 52 },
    { position: 2, model: "all", count: 62, percentage: 26 },
    { position: 3, model: "all", count: 30, percentage: 13 },
    { position: 4, model: "all", count: 14, percentage: 6 },
    { position: 5, model: "all", count: 5, percentage: 2 },
    { position: 6, model: "all", count: 3, percentage: 1 },
    // ChatGPT
    { position: 1, model: "chatgpt", count: 36, percentage: 58 },
    { position: 2, model: "chatgpt", count: 15, percentage: 24 },
    { position: 3, model: "chatgpt", count: 7, percentage: 11 },
    { position: 4, model: "chatgpt", count: 3, percentage: 5 },
    { position: 5, model: "chatgpt", count: 1, percentage: 2 },
    // Gemini
    { position: 1, model: "gemini", count: 27, percentage: 44 },
    { position: 2, model: "gemini", count: 18, percentage: 30 },
    { position: 3, model: "gemini", count: 10, percentage: 16 },
    { position: 4, model: "gemini", count: 4, percentage: 7 },
    { position: 5, model: "gemini", count: 2, percentage: 3 },
    // Claude
    { position: 1, model: "claude", count: 34, percentage: 55 },
    { position: 2, model: "claude", count: 16, percentage: 26 },
    { position: 3, model: "claude", count: 7, percentage: 11 },
    { position: 4, model: "claude", count: 3, percentage: 5 },
    { position: 5, model: "claude", count: 2, percentage: 3 },
    // Perplexity
    { position: 1, model: "perplexity", count: 28, percentage: 47 },
    { position: 2, model: "perplexity", count: 13, percentage: 22 },
    { position: 3, model: "perplexity", count: 6, percentage: 10 },
    { position: 4, model: "perplexity", count: 4, percentage: 7 },
    { position: 5, model: "perplexity", count: 5, percentage: 8 },
    { position: 6, model: "perplexity", count: 3, percentage: 5 },
  ],

  positionDistributionOverTime: (() => {
    const rows: { date: string; model: string; pos1: number; pos2_3: number; pos4_5: number; pos6plus: number }[] = [];
    const WEEKS = 20;
    const now = new Date();
    const base = new Date(now);
    base.setDate(base.getDate() - (WEEKS - 1) * 7);
    const models = ["all", "chatgpt", "gemini", "claude", "perplexity"];
    const modelOffsets: Record<string, number> = { all: 0, chatgpt: 5, gemini: -4, claude: 3, perplexity: -2 };
    for (let i = 0; i < WEEKS; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i * 7);
      const date = d.toISOString().slice(0, 10);
      const t = i / (WEEKS - 1);
      for (const m of models) {
        const off = modelOffsets[m];
        const noise = Math.sin(i * 0.8 + off) * 2;
        const p1 = Math.round(35 + t * 17 + off * 0.4 + noise);
        const p23 = Math.round(44 - t * 9 + noise * 0.4);
        const p45 = Math.round(13 - t * 4 + Math.sin(i) * 1.2);
        const raw6 = 100 - p1 - p23 - p45;
        rows.push({
          date, model: m,
          pos1: Math.max(0, Math.min(100, p1)),
          pos2_3: Math.max(0, Math.min(100, p23)),
          pos4_5: Math.max(0, Math.min(100, p45)),
          pos6plus: Math.max(0, Math.min(100, raw6)),
        });
      }
    }
    return rows;
  })(),

  resultsByQuestion: [
    // What is the most reliable source of clean energy?
    { promptText: "What is the most reliable source of clean energy?", model: "chatgpt", aiVisibility: 100, shareOfVoice: 38, firstPosition: 83, avgPosition: 1.2, avgSentiment: "Strong" },
    { promptText: "What is the most reliable source of clean energy?", model: "gemini", aiVisibility: 100, shareOfVoice: 32, firstPosition: 67, avgPosition: 1.5, avgSentiment: "Strong" },
    { promptText: "What is the most reliable source of clean energy?", model: "claude", aiVisibility: 100, shareOfVoice: 36, firstPosition: 83, avgPosition: 1.2, avgSentiment: "Strong" },
    { promptText: "What is the most reliable source of clean energy?", model: "perplexity", aiVisibility: 100, shareOfVoice: 30, firstPosition: 67, avgPosition: 1.5, avgSentiment: "Positive" },
    // Best low-carbon energy sources for baseload power
    { promptText: "Best low-carbon energy sources for baseload power", model: "chatgpt", aiVisibility: 100, shareOfVoice: 42, firstPosition: 100, avgPosition: 1.0, avgSentiment: "Strong" },
    { promptText: "Best low-carbon energy sources for baseload power", model: "gemini", aiVisibility: 100, shareOfVoice: 35, firstPosition: 83, avgPosition: 1.2, avgSentiment: "Strong" },
    { promptText: "Best low-carbon energy sources for baseload power", model: "claude", aiVisibility: 100, shareOfVoice: 40, firstPosition: 100, avgPosition: 1.0, avgSentiment: "Strong" },
    { promptText: "Best low-carbon energy sources for baseload power", model: "perplexity", aiVisibility: 100, shareOfVoice: 34, firstPosition: 83, avgPosition: 1.3, avgSentiment: "Strong" },
    // Which energy source produces the least greenhouse gas emissions?
    { promptText: "Which energy source produces the least greenhouse gas emissions?", model: "chatgpt", aiVisibility: 100, shareOfVoice: 30, firstPosition: 67, avgPosition: 1.5, avgSentiment: "Strong" },
    { promptText: "Which energy source produces the least greenhouse gas emissions?", model: "gemini", aiVisibility: 100, shareOfVoice: 25, firstPosition: 50, avgPosition: 2.0, avgSentiment: "Positive" },
    { promptText: "Which energy source produces the least greenhouse gas emissions?", model: "claude", aiVisibility: 100, shareOfVoice: 28, firstPosition: 67, avgPosition: 1.5, avgSentiment: "Strong" },
    { promptText: "Which energy source produces the least greenhouse gas emissions?", model: "perplexity", aiVisibility: 100, shareOfVoice: 22, firstPosition: 50, avgPosition: 1.8, avgSentiment: "Positive" },
    // Cheapest energy sources for developing countries
    { promptText: "Cheapest energy sources for developing countries", model: "chatgpt", aiVisibility: 33, shareOfVoice: 5, firstPosition: 0, avgPosition: 4.0, avgSentiment: "Neutral" },
    { promptText: "Cheapest energy sources for developing countries", model: "gemini", aiVisibility: 17, shareOfVoice: 3, firstPosition: 0, avgPosition: 5.0, avgSentiment: "Neutral" },
    { promptText: "Cheapest energy sources for developing countries", model: "claude", aiVisibility: 33, shareOfVoice: 6, firstPosition: 0, avgPosition: 3.8, avgSentiment: "Neutral" },
    { promptText: "Cheapest energy sources for developing countries", model: "perplexity", aiVisibility: 17, shareOfVoice: 2, firstPosition: 0, avgPosition: 5.0, avgSentiment: "Negative" },
    // Best renewable energy investments for 2025
    { promptText: "Best renewable energy investments for 2025", model: "chatgpt", aiVisibility: 67, shareOfVoice: 12, firstPosition: 17, avgPosition: 3.0, avgSentiment: "Neutral" },
    { promptText: "Best renewable energy investments for 2025", model: "gemini", aiVisibility: 50, shareOfVoice: 8, firstPosition: 0, avgPosition: 3.5, avgSentiment: "Neutral" },
    { promptText: "Best renewable energy investments for 2025", model: "claude", aiVisibility: 67, shareOfVoice: 14, firstPosition: 17, avgPosition: 2.8, avgSentiment: "Positive" },
    { promptText: "Best renewable energy investments for 2025", model: "perplexity", aiVisibility: 50, shareOfVoice: 10, firstPosition: 0, avgPosition: 3.2, avgSentiment: "Neutral" },
    // What are the pros and cons of nuclear power?
    { promptText: "What are the pros and cons of nuclear power?", model: "chatgpt", aiVisibility: 100, shareOfVoice: 45, firstPosition: 100, avgPosition: 1.0, avgSentiment: "Positive" },
    { promptText: "What are the pros and cons of nuclear power?", model: "gemini", aiVisibility: 100, shareOfVoice: 40, firstPosition: 100, avgPosition: 1.0, avgSentiment: "Positive" },
    { promptText: "What are the pros and cons of nuclear power?", model: "claude", aiVisibility: 100, shareOfVoice: 44, firstPosition: 100, avgPosition: 1.0, avgSentiment: "Positive" },
    { promptText: "What are the pros and cons of nuclear power?", model: "perplexity", aiVisibility: 100, shareOfVoice: 42, firstPosition: 100, avgPosition: 1.0, avgSentiment: "Neutral" },
    // Which power sources can run 24/7 without intermittency?
    { promptText: "Which power sources can run 24/7 without intermittency?", model: "chatgpt", aiVisibility: 100, shareOfVoice: 40, firstPosition: 83, avgPosition: 1.2, avgSentiment: "Strong" },
    { promptText: "Which power sources can run 24/7 without intermittency?", model: "gemini", aiVisibility: 100, shareOfVoice: 35, firstPosition: 67, avgPosition: 1.5, avgSentiment: "Strong" },
    { promptText: "Which power sources can run 24/7 without intermittency?", model: "claude", aiVisibility: 100, shareOfVoice: 38, firstPosition: 83, avgPosition: 1.2, avgSentiment: "Strong" },
    { promptText: "Which power sources can run 24/7 without intermittency?", model: "perplexity", aiVisibility: 100, shareOfVoice: 32, firstPosition: 67, avgPosition: 1.5, avgSentiment: "Positive" },
    // Most environmentally friendly energy sources
    { promptText: "Most environmentally friendly energy sources", model: "chatgpt", aiVisibility: 83, shareOfVoice: 18, firstPosition: 33, avgPosition: 2.5, avgSentiment: "Positive" },
    { promptText: "Most environmentally friendly energy sources", model: "gemini", aiVisibility: 67, shareOfVoice: 14, firstPosition: 17, avgPosition: 3.0, avgSentiment: "Neutral" },
    { promptText: "Most environmentally friendly energy sources", model: "claude", aiVisibility: 83, shareOfVoice: 20, firstPosition: 33, avgPosition: 2.2, avgSentiment: "Positive" },
    { promptText: "Most environmentally friendly energy sources", model: "perplexity", aiVisibility: 67, shareOfVoice: 12, firstPosition: 17, avgPosition: 3.2, avgSentiment: "Neutral" },
    // Best energy options for tropical island nations
    { promptText: "Best energy options for tropical island nations", model: "chatgpt", aiVisibility: 17, shareOfVoice: 3, firstPosition: 0, avgPosition: 5.0, avgSentiment: "Neutral" },
    { promptText: "Best energy options for tropical island nations", model: "gemini", aiVisibility: 0, shareOfVoice: 0, firstPosition: 0, avgPosition: null, avgSentiment: "Neutral" },
    { promptText: "Best energy options for tropical island nations", model: "claude", aiVisibility: 17, shareOfVoice: 4, firstPosition: 0, avgPosition: 4.5, avgSentiment: "Neutral" },
    { promptText: "Best energy options for tropical island nations", model: "perplexity", aiVisibility: 0, shareOfVoice: 0, firstPosition: 0, avgPosition: null, avgSentiment: "Neutral" },
  ],

  opportunityPrompts: [
    { prompt: "Best distributed energy resources for microgrids", competitorCount: 4, competitors: ["Solar", "Wind", "Battery Storage", "Diesel Generators"] },
    { prompt: "Top energy technologies for residential use", competitorCount: 4, competitors: ["Solar", "Heat Pumps", "Natural Gas", "Geothermal"] },
    { prompt: "Which energy sources are best for rural electrification?", competitorCount: 3, competitors: ["Solar", "Wind", "Micro-Hydro"] },
    { prompt: "Best energy solutions for data center power", competitorCount: 3, competitors: ["Natural Gas", "Solar", "Wind"] },
    { prompt: "Most promising energy storage technologies", competitorCount: 3, competitors: ["Lithium-Ion Batteries", "Pumped Hydro", "Green Hydrogen"] },
    { prompt: "Top energy sources for maritime shipping", competitorCount: 2, competitors: ["LNG", "Green Hydrogen"] },
    { prompt: "Best energy options for steel manufacturing", competitorCount: 2, competitors: ["Green Hydrogen", "Electric Arc"] },
    { prompt: "Which energy sources work best in desert climates?", competitorCount: 2, competitors: ["Solar", "Concentrated Solar Power"] },
  ],

  promptPositions: [
    { promptText: "What is the most reliable source of clean energy?", model: "chatgpt", position: 1 },
    { promptText: "What is the most reliable source of clean energy?", model: "gemini", position: 1 },
    { promptText: "What is the most reliable source of clean energy?", model: "claude", position: 2 },
    { promptText: "What is the most reliable source of clean energy?", model: "perplexity", position: 1 },
    { promptText: "Best energy sources for reducing carbon emissions", model: "chatgpt", position: 2 },
    { promptText: "Best energy sources for reducing carbon emissions", model: "gemini", position: 1 },
    { promptText: "Best energy sources for reducing carbon emissions", model: "claude", position: 1 },
    { promptText: "Best energy sources for reducing carbon emissions", model: "perplexity", position: 2 },
    { promptText: "Which energy sources are best for baseload power?", model: "chatgpt", position: 1 },
    { promptText: "Which energy sources are best for baseload power?", model: "gemini", position: 1 },
    { promptText: "Which energy sources are best for baseload power?", model: "claude", position: 1 },
    { promptText: "Which energy sources are best for baseload power?", model: "perplexity", position: 1 },
    { promptText: "Top energy technologies for industrial decarbonization", model: "chatgpt", position: 2 },
    { promptText: "Top energy technologies for industrial decarbonization", model: "gemini", position: 3 },
    { promptText: "Top energy technologies for industrial decarbonization", model: "claude", position: 2 },
    { promptText: "Top energy technologies for industrial decarbonization", model: "perplexity", position: 3 },
    { promptText: "Safest forms of energy production", model: "chatgpt", position: 1 },
    { promptText: "Safest forms of energy production", model: "gemini", position: 2 },
    { promptText: "Safest forms of energy production", model: "claude", position: 1 },
    { promptText: "Safest forms of energy production", model: "perplexity", position: 2 },
    { promptText: "Most cost-effective energy for new power plants", model: "chatgpt", position: 3 },
    { promptText: "Most cost-effective energy for new power plants", model: "gemini", position: 4 },
    { promptText: "Most cost-effective energy for new power plants", model: "claude", position: 3 },
    { promptText: "Most cost-effective energy for new power plants", model: "perplexity", position: null },
  ],
};

export const NUCLEAR_ENERGY_DUMMY_TOTALS = {
  totalRuns: 240,
  totalMentions: 204,
};

export const NUCLEAR_ENERGY_DUMMY_JOB = {
  id: "dummy-nuclear-energy-job",
  model: "all",
  range: 90,
  finishedAt: new Date().toISOString(),
};
