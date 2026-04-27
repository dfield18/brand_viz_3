export const AUTHORITY_SIGNALS = [
  "leader", "top", "best", "market-leading", "widely used", "dominant",
  "premier", "#1", "number one", "gold standard", "industry leader",
  "market leader", "leading provider", "go-to", "well-established",
];

export const TRUST_SIGNALS = [
  "trusted", "reliable", "credible", "established", "proven",
  "dependable", "reputable", "secure", "transparent", "accountable",
  "consistent", "trustworthy",
];

export const WEAKNESS_SIGNALS = [
  "expensive", "limited", "lacks", "poor", "complex", "confusing",
  "slow", "weak", "inadequate", "outdated", "criticism", "criticized",
  "controversial", "overpriced", "difficult", "unreliable", "risky",
  "behind", "falling short", "backlash", "boycott", "lawsuit",
  "sued", "allegations", "scandal", "condemned", "denounced",
  "under fire", "problematic", "complicit",
];

export const POSITIVE_DESCRIPTORS = [
  "leading", "powerful", "reliable", "trusted", "comprehensive",
  "strong", "innovative", "excellent", "popular", "premium",
  "efficient", "effective", "robust", "dynamic", "respected",
  "successful", "impressive", "competitive", "versatile", "renowned",
];

export const NEGATIVE_DESCRIPTORS = [
  "expensive", "limited", "confusing", "complex", "weak", "niche",
  "unreliable", "controversial", "risky", "outdated", "overpriced",
  "difficult", "slow", "inadequate", "inconsistent", "questionable",
];

// Linguistic hedging cues — words/phrases that soften assertions and
// signal uncertainty about the subject. countSignalHits dedupes by
// distinct signal, so a single common word repeated many times still
// scores 1; the metric is "how many distinct hedging vocabularies
// the response reaches for," which correlates with actual tentativeness.
// Threshold is 2+ in the API: one "may" by itself is not hedging.
export const HEDGING_SIGNALS = [
  // Epistemic modals
  "may", "might", "could",
  // Likelihood adverbs
  "possibly", "perhaps", "maybe", "presumably", "supposedly", "likely",
  // Reporting hedges
  "appears to", "seems to", "tends to", "is said to", "are said to",
  "reportedly", "allegedly", "reputedly",
  // Approximators
  "approximately", "roughly", "around", "somewhat", "fairly", "relatively",
  // Frequency hedges
  "generally", "typically", "usually", "often", "sometimes",
  // Phrasal hedges
  "in some cases", "in many cases", "it is unclear", "it is debated",
  "it is unknown", "opinions vary", "opinions are divided",
];
