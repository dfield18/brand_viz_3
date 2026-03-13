export interface TopicDef {
  key: string;
  label: string;
  keywords: string[];
  negativeKeywords?: string[];
}

export const TOPIC_TAXONOMY: TopicDef[] = [
  {
    key: "brand_reputation",
    label: "Brand Reputation & Identity",
    keywords: [
      "known for", "reputation", "identity", "recognized", "famous",
      "what is", "who is", "tell me about", "describe", "overview",
    ],
  },
  {
    key: "sustainability",
    label: "Sustainability & Environment",
    keywords: [
      "sustainability", "sustainable", "environment", "environmental",
      "green", "carbon", "eco", "climate", "renewable", "recycling",
      "eco-friendly",
    ],
  },
  {
    key: "competitive_comparison",
    label: "Competitive Comparison",
    keywords: [
      "vs", "versus", "compared to", "comparison", "competitors",
      "better than", "worse than", "differ", "compete",
    ],
  },
  {
    key: "product_quality",
    label: "Product Quality & Performance",
    keywords: [
      "quality", "performance", "reliable", "durable", "best",
      "rating", "review", "tested", "premium", "craftsmanship",
    ],
  },
  {
    key: "market_position",
    label: "Market Position & Leadership",
    keywords: [
      "market", "leader", "leading", "top companies", "biggest",
      "largest", "dominant", "market share", "industry leader",
      "top", "companies",
    ],
  },
  {
    key: "customer_experience",
    label: "Customer Experience",
    keywords: [
      "customer", "service", "support", "experience", "satisfaction",
      "complaint", "feedback", "warranty", "return policy",
    ],
  },
  {
    key: "innovation",
    label: "Innovation & Technology",
    keywords: [
      "innovation", "innovative", "technology", "tech", "ai",
      "cutting-edge", "new feature", "latest", "advancement", "digital",
    ],
  },
  {
    key: "pricing_value",
    label: "Pricing & Value",
    keywords: [
      "price", "pricing", "cost", "affordable", "expensive",
      "value", "budget", "worth", "deal", "cheap",
    ],
  },
  {
    key: "industry_trends",
    label: "Industry Trends",
    keywords: [
      "trend", "future", "outlook", "forecast", "prediction",
      "emerging", "growing", "declining",
    ],
  },
  {
    key: "social_impact",
    label: "Social Impact & Ethics",
    keywords: [
      "social", "ethical", "ethics", "diversity", "inclusion",
      "community", "impact", "responsibility", "labor", "workers",
    ],
  },
  {
    key: "use_cases",
    label: "Use Cases & Applications",
    keywords: [
      "use case", "application", "best for", "recommend",
      "suitable", "scenario", "when to use", "good for", "ideal for",
    ],
  },
  {
    key: "brand_discovery",
    label: "Brand Discovery & Alternatives",
    keywords: [
      "similar", "alternative", "brands like", "options",
      "choices", "other brands", "discover", "find",
    ],
  },
  {
    key: "trust_reliability",
    label: "Trust & Reliability",
    keywords: [
      "trust", "trusted", "reliable", "dependable", "safe",
      "secure", "credible", "proven", "track record",
    ],
  },
  {
    key: "seasonal_contextual",
    label: "Seasonal & Contextual",
    keywords: [
      "winter", "summer", "spring", "fall", "season", "weather",
      "holiday", "outdoor", "indoor", "commute", "road trip",
    ],
  },
  {
    key: "other",
    label: "Other",
    keywords: [],
  },
];
