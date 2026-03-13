export interface RunAnalysis {
  brandMentioned: boolean;
  brandMentionStrength: number; // 0-100
  competitors: { name: string; mentionStrength: number }[];
  topics: { name: string; relevance: number }[];
  frames: { name: string; strength: number }[];
  sentiment: { legitimacy: number; controversy: number };
  hedgingScore: number; // 0-100
  authorityScore: number; // 0-100
}
