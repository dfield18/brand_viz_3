export type EntityType = "brand";

export type ModelKey = "chatgpt" | "gemini" | "claude" | "perplexity" | "google";

export interface Brand {
  id: string;
  name: string;
  type: EntityType;
  slug: string;
  createdAt: string;
}

export interface Filters {
  range: 7 | 30 | 90;
  model: "all" | ModelKey;
}

export interface KpiCard {
  label: string;
  value: number;
  unit: "%" | "score" | "count";
  delta: number; // positive = improvement
  displayText?: string; // text value shown instead of number (e.g. frame name)
  barPct?: number;      // optional progress bar underneath (0–100)
}

export interface FrameDistribution {
  frame: string;
  percentage: number; // % of responses containing this frame (frequency-based)
  byModel?: Record<string, number>;
}

export interface TrendPoint {
  date: string; // ISO date string (YYYY-MM-DD)
  visibility: number;
  controversy: number;
  authority: number;
}

export interface ClusterVisibility {
  cluster: string;
  mentionRate: number;    // % of prompts that mention the brand
  prominenceScore: number; // avg brandMentionStrength for this cluster
}

export interface ModelComparison {
  model: string;
  visibility: number;
  mentionRate: number;
  controversy: number;
  authority: number;
  sentiment: number;
  narrativeStability: number;
  avgRank: number | null;
}

export interface OverviewResponse {
  kpis: KpiCard[];
  topFrames: FrameDistribution[];
  trend: TrendPoint[];
  clusterVisibility: ClusterVisibility[];
  modelComparison: ModelComparison[];
}

// --- Narrative tab ---

export interface NarrativeFrame {
  frame: string;
  percentage: number; // 0–100
  byModel: Record<ModelKey, number>; // per-model % for this frame
}

export interface PositioningPoint {
  legitimacy: number;   // 0–100 (x-axis)
  controversy: number;  // 0–100 (y-axis)
  label: string;        // brand name
}

export interface NarrativeSentimentSplit {
  positive: number;
  neutral: number;
  negative: number;
}

export interface NarrativeThemePrompt {
  text: string;
  pct: number; // 0-100, share of this theme's hits from this prompt
}

export interface NarrativeTheme {
  key: string;
  label: string;
  count: number;
  pct: number; // 0-100
  prompts?: NarrativeThemePrompt[];
}

export interface NarrativeDescriptor {
  word: string;
  polarity: "positive" | "negative" | "neutral";
  count: number;
}

export interface NarrativeClaim {
  text: string;
  count: number;
  model?: string;
  prompt?: string;
}

export interface SentimentTrendPoint {
  date: string;   // "YYYY-MM-DD" (Monday of week)
  model: string;  // "all" or specific model key
  positive: number;  // 0-100
}

export interface NarrativeDriftPoint {
  date: string;
  drift: number; // 0-1 (JSD)
  topThemes: { key: string; label: string; pct: number }[];
  emerging: string[];
  declining: string[];
  themeDrift?: Record<string, number>; // per-theme JSD
}

export interface NarrativeExample {
  prompt: string;
  excerpt: string;
  themes: string[];
  sentiment: string;
  model?: string;
}

export interface SentimentByQuestionEntry {
  prompt: string;
  mentions: number;
  mentionRate: number; // 0–100 percentage of total narrative runs
  consistency: number; // 0–100: how reliably this prompt produces the same sentiment
  sentiment: "Strong" | "Positive" | "Neutral" | "Conditional" | "Negative";
  sentimentScore: number; // -1 to 1 for positioning
}

export interface NarrativeResponse {
  frames: NarrativeFrame[]; // 6 items; percentages sum ~100
  positioning: PositioningPoint[]; // v1: 1 point (the selected brand)
  hedgingRate: number; // 0–100
  hedgingTrend: { date: string; value: number }[]; // 12 points (weekly)
  // Enhanced narrative data (optional for backward compat)
  sentimentSplit?: NarrativeSentimentSplit;
  authorityRate?: number;
  trustRate?: number;
  weaknessRate?: number;
  polarization?: "Low" | "Moderate" | "High";
  themes?: NarrativeTheme[];
  descriptors?: NarrativeDescriptor[];
  strengths?: NarrativeClaim[];
  weaknesses?: NarrativeClaim[];
  weaknessesAreNeutral?: boolean;
  drift?: NarrativeDriftPoint[];
  sentimentTrend?: SentimentTrendPoint[];
  frameTrend?: Record<string, string | number>[];
  examples?: NarrativeExample[];
  sentimentByQuestion?: SentimentByQuestionEntry[];
}

// --- Visibility tab ---

export interface ClusterMentions {
  cluster: "direct" | "related" | "comparative" | "network" | "industry";
  mentionRate: number; // 0–100
  byModel: Record<ModelKey, number>; // per-model mention rate for this cluster
}

export interface IntentSplit {
  intent: "high-intent" | "informational";
  percentage: number; // 0–100 (two values sum ~100)
}

export interface ClusterBreakdownRow {
  cluster: "direct" | "related" | "comparative" | "network" | "industry";
  mentionRate: number;        // 0–100
  avgRank: number | null;     // avg position, null if no data
  firstMentionPct: number | null; // % mentioned first, null if no data
}

export interface ModelBreakdownRow {
  model: string;
  mentionRate: number | null;       // 0–100, null if no runs
  avgRank: number | null;
  firstMentionPct: number | null;
  totalRuns: number;
}

export interface TopPromptWin {
  prompt: string;
  rank: number;
  cluster: string;
}

export interface VisibilityTrendPoint {
  date: string;
  model: string; // "all" or specific model
  prompt?: string; // "all" or specific prompt text
  mentionRate: number;
  avgPosition: number | null;
  firstMentionPct: number | null;
  sovPct: number | null;
}

export interface RankDistributionRow {
  rank: number;
  count: number;
  percentage: number; // 0–100
}

export interface VisibilityResponse {
  clusters: ClusterMentions[]; // 5 items (direct/related/comparative/network/industry)
  clusterBreakdown: ClusterBreakdownRow[];
  modelBreakdown: ModelBreakdownRow[];
  topPromptWins: TopPromptWin[];
  trend: VisibilityTrendPoint[];
  rankDistribution: RankDistributionRow[];
  intentSplit: IntentSplit[];  // 2 items
  overallMentionRate: number;  // 0–100
  shareOfVoice: number;        // 0–100 brand mentions / all entity mentions
  avgRankScore: number;        // 1 = first mentioned
  firstMentionRate: number;    // 0–100
  prominence: number;          // 0–100
  visibilityRanking: VisibilityRankingEntry[];
  positionDistribution: PositionDistributionEntry[];
  positionDistributionOverTime: PositionDistributionOverTimeEntry[];
  opportunityPrompts: OpportunityPrompt[];
  kpiDeltas: KpiDeltas | null;
  worstPerformingPrompts: WorstPerformingPrompt[];
  resultsByQuestion: ResultByQuestion[];
  promptPositions: PromptPosition[];
}

export interface PromptPosition {
  promptText: string;
  model: string;
  position: number | null; // null = not mentioned
}

export interface ResultByQuestion {
  promptText: string;
  model: string;
  aiVisibility: number;       // 0–100
  shareOfVoice: number;       // 0–100
  firstPosition: number;      // 0–100
  avgPosition: number | null;
  avgSentiment: "Strong" | "Positive" | "Neutral" | "Negative";
}

export interface KpiDeltas {
  mentionRate: number;
  shareOfVoice: number;
  avgRank: number;
  firstMentionRate: number;
  prominence: number;
}

export interface NarrativeDeltas {
  sentimentPositive: number;  // delta in positive % points
  confidence: number;         // delta in confidence % points (100 - hedging)
}

export interface WorstPerformingPrompt {
  prompt: string;
  rank: number | null;        // null = brand absent
  competitors: string[];      // up to 5, sorted by prominence
}

export interface VisibilityRankingEntry {
  entityId: string;
  name: string;
  score: number;   // 0–100 (% of industry responses mentioning entity)
  isBrand: boolean;
}

export interface OpportunityPrompt {
  prompt: string;
  competitorCount: number;
  competitors: string[];
}

export interface PositionDistributionEntry {
  position: number;
  model: string; // "all" or specific model
  count: number;
  percentage: number; // 0–100
}

export interface PositionDistributionOverTimeEntry {
  date: string;        // "YYYY-MM-DD"
  model: string;       // "all" | "chatgpt" | "gemini" | "claude" | "perplexity"
  pos1: number;        // percentage 0–100
  pos2: number;
  pos3: number;
  pos4_5: number;
  pos6plus: number;
}

// --- Competition tab ---

export interface CompetitionScope {
  totalResponses: number;
  modelsIncluded: string[];
  entitiesTracked: number;
}

export interface CompetitorRow {
  entityId: string;
  name: string;
  isBrand: boolean;
  mentionShare: number;     // 0-100
  mentionRate: number;      // 0-100
  avgRank: number | null;
  rank1Rate: number;        // 0-100
  avgProminence: number;    // 0-100
  appearances: number;
  avgSentiment?: "Strong" | "Positive" | "Neutral" | "Conditional" | "Negative";
  sentimentScore?: number;  // raw -1 to 1 average
  sentimentDist?: Record<string, number>;  // per-response count by sentiment label
}

export interface FragmentationMetric {
  score: number;   // 0-100 (higher = more fragmented)
  hhi: number;
}

export interface PromptMatrixRow {
  promptId: string;
  promptText: string;
  cluster: string;
  intent: string;
  model: string;
  entities: Record<string, { rank: number | null; prominence: number }>;
}

export interface WinLossCompetitor {
  entityId: string;
  name: string;
  wins: number;
  losses: number;
  lossRate: number; // 0-100
}

export interface TopLoss {
  promptText: string;
  cluster: string;
  intent: string;
  yourRank: number | null;
  yourProminence: number;
  competitorName: string;
  competitorRank: number | null;
  competitorProminence: number;
}

export interface WinLossData {
  byCompetitor: WinLossCompetitor[];
  topLosses: TopLoss[];
}

export interface ModelSplitRow {
  model: string;
  competitors: CompetitorRow[];
}

export interface CompetitiveTrendPoint {
  date: string;
  mentionShare: Record<string, number>;  // entityId → share %
  mentionRate: Record<string, number>;   // entityId → visibility % (appearances / responses)
  avgPosition?: Record<string, number | null>;  // entityId → avg rank position
  rank1Rate?: Record<string, number>;    // entityId → % of mentions where brand is #1
}

export interface ProminenceShareRow {
  entityId: string;
  name: string;
  isBrand: boolean;
  avgProminence: number;
  prominenceShare: number;  // 0-100
}

export interface CompetitiveOpportunity {
  promptText: string;
  cluster: string;
  intent: string;
  model: string;
  brandRank: number | null;
  topCompetitor: string;
  topCompetitorRank: number;
  impactScore: number;  // 0-100
}

export interface CoMentionPair {
  entityA: string;
  entityB: string;
  coMentionCount: number;
  coMentionRate: number;  // 0-100
}

export interface CompetitorNarrative {
  entityId: string;
  name: string;
  themes: { key: string; label: string; count: number; pct: number }[];
  strengths: NarrativeClaim[];
  weaknesses: NarrativeClaim[];
  descriptors: NarrativeDescriptor[];
}

export interface CompetitiveSentimentTrendPoint {
  date: string;
  sentiment: Record<string, number>;  // entityId → 0-100 (50 = neutral)
}

export interface CompetitionResponse {
  scope: CompetitionScope;
  competitors: CompetitorRow[];
  fragmentation: FragmentationMetric;
  rankDistribution: Record<string, Record<number, number>>;
  promptMatrix: PromptMatrixRow[];
  winLoss: WinLossData;
  modelSplit: ModelSplitRow[];
  competitiveTrend: CompetitiveTrendPoint[];
  prominenceShare: ProminenceShareRow[];
  competitiveOpportunities: CompetitiveOpportunity[];
  coMentions: CoMentionPair[];
  competitorNarratives?: CompetitorNarrative[];
  sentimentTrend?: CompetitiveSentimentTrendPoint[];
}

// --- Legacy competition types (used by aggregateAnalysis.ts) ---

/** @deprecated Use CompetitorRow instead */
export interface CompetitorSOV {
  brand: string;
  shareOfVoice: number;
  byModel: Record<ModelKey, number>;
}

/** @deprecated Use CompetitionResponse instead */
export interface FrameDifferential {
  frame: string;
  selfShare: number;
  competitorAvgShare: number;
}

/** @deprecated Use CompetitionResponse instead */
export interface LegacyCompetitionResponse {
  shareOfVoice: CompetitorSOV[];
  frameDifferentials: FrameDifferential[];
}

// --- Topics tab (v2) ---

export interface TopicsScope {
  totalResponses: number;
  modelsIncluded: string[];
  topicsClassified: number;
  unclassifiedPrompts: number;
}

export interface TopicRow {
  topicKey: string;
  topicLabel: string;
  promptCount: number;
  mentionCount: number;
  mentionRate: number;         // 0-100
  avgRank: number | null;
  rank1Rate: number;           // 0-100
  avgProminence: number;       // 0-100
  categoryAvgMentionRate: number; // 0-100
  leaderMentionRate: number;      // 0-100
  leaderName: string;
}

export interface TopicOwnershipRow {
  topicKey: string;
  topicLabel: string;
  leaderEntityId: string;
  leaderName: string;
  leaderMentionShare: number;  // 0-100
  brandMentionShare: number;   // 0-100
  brandRank: number | null;
}

export interface EmergingTopic {
  topicKey: string;
  topicLabel: string;
  currentMentions: number;
  previousMentions: number;
  growthRate: number;          // percentage
  confidence: "Low" | "Medium" | "High";
  samplePrompts: string[];
}

export interface TopicModelSplitRow {
  model: string;
  topics: {
    topicKey: string;
    topicLabel: string;
    mentionRate: number;
    avgRank: number | null;
  }[];
}

export interface TopicImportanceRow {
  topicKey: string;
  topicLabel: string;
  importanceRate: number;      // 0-100
  nPrompts: number;
  nResponses: number;
}

export interface TopicTrendPoint {
  date: string;
  values: Record<string, number>;  // topicKey → metric value
  sampleSize: number;
}

export interface TopicProminenceRow {
  topicKey: string;
  topicLabel: string;
  avgProminence: number;
  nMentions: number;
  prominenceShare: number;     // 0-100
}

export interface TopicPromptExample {
  promptId: string;
  promptText: string;
  topicKey: string;
  topicLabel: string;
  model: string;
  brandRank: number | null;
  brandProminence: number;
  topCompetitor: string | null;
  topCompetitorRank: number | null;
  cluster: string;
}

export interface TopicFragmentationRow {
  topicKey: string;
  topicLabel: string;
  label: "Fragmented" | "Moderate" | "Concentrated";
  leaderName: string;
  leaderShare: number;         // 0-100
}

export interface TopicsResponse {
  scope: TopicsScope;
  topics: TopicRow[];
  ownership: TopicOwnershipRow[];
  emerging: EmergingTopic[];
  modelSplit: TopicModelSplitRow[];
  importance: TopicImportanceRow[];
  trend: TopicTrendPoint[];
  prominence: TopicProminenceRow[];
  promptExamples: TopicPromptExample[];
  fragmentation: TopicFragmentationRow[];
}

// --- Legacy topic types (used by aggregateAnalysis.ts) ---

/** @deprecated Use TopicRow instead */
export interface LegacyTopicAssociation {
  topic: string;
  strength: number;
  byModel: Record<ModelKey, number>;
}

/** @deprecated Use TopicsResponse instead */
export interface LegacyTopicsResponse {
  topics: LegacyTopicAssociation[];
  topTopicTrend: { date: string; value: number }[];
}

// --- Sources tab ---

export interface SourcesScope {
  totalResponses: number;
  modelsIncluded: string[];
  uniqueDomains: number;
  totalCitations: number;
}

export interface SourceSummary {
  totalCitations: number;
  uniqueDomains: number;
  citationsPerResponse: number;
  pctResponsesWithCitations: number;
  authorityDriverCount: number;
}

export interface TopDomainRow {
  domain: string;
  category?: string;
  citations: number;
  responses: number;
  avgRankWhenCited: number | null;
  avgProminenceWhenCited: number;
  rank1RateWhenCited: number;
  prominenceLift: number;
  rankLift: number;
  firstSeen: string;
  lastSeen: string;
}

export interface SourceModelSplitRow {
  model: string;
  domains: { domain: string; citations: number }[];
}

export interface EmergingSourcePrompt {
  promptId: string;
  promptText: string;
  model: string;
  url: string;
}

export interface EmergingSource {
  domain: string;
  currentCitations: number;
  previousCitations: number;
  growthRate: number;
  prompts?: EmergingSourcePrompt[];
}

export interface CompetitorCrossCitation {
  domain: string;
  entityCounts: Record<string, number>;
}

export interface OfficialSitePage {
  url: string;
  citations: number;
  models: string[];
}

export interface OfficialSiteCitation {
  entityId: string;
  isBrand: boolean;
  officialDomain: string;
  citations: number;
  models: string[];
  pages: OfficialSitePage[];
}

export interface SourcePromptMatrixRow {
  domain: string;
  prompts: Record<string, number>; // promptId → citation count
}

export interface SourceMatrixPrompt {
  promptId: string;
  promptText: string;
}

export interface BrandAttributedSource {
  domain: string;
  category?: string;
  citations: number;        // times cited near brand
  totalCitations: number;   // times cited overall
  urls: string[];           // unique URLs from this domain cited near brand
  models: string[];         // which AI models cite this source near brand
}

export interface SourceCategoryOverTimeEntry {
  date: string;          // "YYYY-MM-DD"
  model: string;         // "all" | "chatgpt" | "gemini" | "claude" | "perplexity"
  [category: string]: string | number; // category keys map to percentage 0–100
}

export interface DomainOverTimeEntry {
  date: string;          // "YYYY-MM-DD"
  model: string;         // "all" | "chatgpt" | "gemini" | "claude" | "perplexity"
  [domain: string]: string | number; // domain keys map to citation count
}

export interface SourcesResponse {
  scope: SourcesScope;
  summary: SourceSummary;
  topDomains: TopDomainRow[];
  modelSplit: SourceModelSplitRow[];
  emerging: EmergingSource[];
  crossCitation: CompetitorCrossCitation[];
  officialSites: OfficialSiteCitation[];
  sourcePromptMatrix: SourcePromptMatrixRow[];
  matrixPrompts: SourceMatrixPrompt[];
  brandAttributedSources?: BrandAttributedSource[];
  categoryOverTime: SourceCategoryOverTimeEntry[];
  domainOverTime: DomainOverTimeEntry[];
}

export interface DomainDetailExample {
  promptText: string;
  responseExcerpt: string;
  model: string;
  entityId: string | null;
  normalizedUrl: string;
  brandProminence: number | null;
  brandRank: number | null;
  createdAt: string;
}

export interface DomainDetailResponse {
  domain: string;
  examples: DomainDetailExample[];
  totalOccurrences: number;
}
