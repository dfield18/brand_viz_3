export interface ThemeDef {
  key: string;
  label: string;
  keywords: string[];
  negativeKeywords?: string[];
}

export const THEME_TAXONOMY: ThemeDef[] = [
  {
    key: "innovation",
    label: "Innovation",
    keywords: ["innovative", "innovation", "cutting-edge", "pioneering", "breakthrough", "disruptive", "revolutionary"],
  },
  {
    key: "quality",
    label: "Quality & Craftsmanship",
    keywords: ["quality", "premium", "well-made", "craftsmanship", "durable", "high-end", "superior"],
  },
  {
    key: "sustainability",
    label: "Sustainability",
    keywords: ["sustainable", "sustainability", "eco-friendly", "green", "environmental", "carbon", "renewable", "recycled"],
  },
  {
    key: "value_pricing",
    label: "Pricing & Value",
    keywords: ["affordable", "value", "cost", "price", "expensive", "budget", "cost-effective", "overpriced"],
  },
  {
    key: "market_leadership",
    label: "Market Leadership",
    keywords: ["leader", "leading", "dominant", "market share", "top", "largest", "number one", "#1", "market leader"],
  },
  {
    key: "customer_experience",
    label: "Customer Experience",
    keywords: ["customer service", "experience", "support", "satisfaction", "loyalty", "user-friendly", "customer-centric"],
  },
  {
    key: "trust_reliability",
    label: "Trust & Reliability",
    keywords: ["reliable", "trusted", "dependable", "established", "credible", "proven", "reputable", "consistent"],
  },
  {
    key: "technology",
    label: "Technology",
    keywords: ["technology", "tech", "platform", "digital", "ai", "automation", "data-driven", "software"],
  },
  {
    key: "brand_reputation",
    label: "Brand Reputation",
    keywords: ["reputation", "well-known", "recognized", "famous", "iconic", "household name", "brand recognition"],
  },
  {
    key: "controversy_risk",
    label: "Controversy & Risk",
    keywords: ["controversy", "scandal", "lawsuit", "criticism", "backlash", "risk", "controversial", "criticized"],
    negativeKeywords: ["low risk", "no controversy"],
  },
  {
    key: "social_impact",
    label: "Social Impact",
    keywords: ["community", "social responsibility", "diversity", "inclusion", "charity", "philanthropic", "giving back"],
  },
  {
    key: "global_reach",
    label: "Global Reach",
    keywords: ["global", "international", "worldwide", "countries", "expansion", "multinational", "global presence"],
  },
];
