/**
 * Landing page copy (generic company / brand edition).
 *
 * Snapshot of the landing page voice targeted at companies and marketing teams,
 * captured after the retarget from the advocacy voice (see
 * landingCopy.advocacy.ts) and after the removal of "and your products" from
 * the hero description.
 *
 * Not imported anywhere. Kept as a reference so this particular phrasing can
 * be restored or reused on a segment-specific landing page if the live copy
 * evolves away from it.
 */

export const BRAND_METADATA = {
  title: "aiSaysWhat — See what ChatGPT, Gemini & Claude say about your brand",
  description:
    "AI brand visibility for companies and marketing teams. Monitor how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe your brand. Track sentiment, competitors, and source citations. Start free.",
};

export const BRAND_ROOT_DESCRIPTION =
  "Monitor how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe your brand. Visibility scores, sentiment analysis, competitor tracking, and source citations — all on one dashboard.";

export const BRAND_OG_DESCRIPTION =
  "Monitor how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe your brand.";

export const BRAND_ROOT_TITLES = {
  default: "aiSaysWhat — AI brand visibility for companies and marketing teams",
  openGraph: "aiSaysWhat — AI brand visibility for companies and marketing teams",
  twitter: "aiSaysWhat — AI brand visibility for companies and marketing teams",
  twitterDescription:
    "See what AI platforms say about your brand. Visibility scores, sentiment, competitor tracking, citations.",
};

export const BRAND_KEYWORDS = [
  "AI brand monitoring",
  "AI brand visibility",
  "ChatGPT visibility tracking",
  "generative engine optimization",
  "GEO",
  "brand tracking AI",
  "competitive brand intelligence",
  "AI search analytics",
  "LLM brand tracking",
];

export const BRAND_STRUCTURED_DATA = {
  softwareApplicationDescription:
    "AI brand visibility platform for companies and marketing teams. Monitors how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe your brand — with visibility scores, sentiment analysis, competitor tracking, and source citations.",
  organizationDescription:
    "AI brand visibility for companies and marketing teams.",
};

export const BRAND_HERO = {
  headline: "AI is shaping how people discover your brand.",
  subheadline: "Do you know what it\u2019s saying?",
  description:
    "aiSaysWhat monitors how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe your brand.",
  cta: "Try it free",
  footnote: "By signing up you agree to receive occasional updates from aiSaysWhat.",
};

export const BRAND_FEATURES = [
  {
    title: "Mention Rate",
    description:
      "When customers ask AI about your category, how often does your brand come up?",
  },
  {
    title: "Sentiment & Narrative",
    description:
      "Is AI framing your brand positively or negatively? What story is it telling about your products?",
  },
  {
    title: "Competitive Share",
    description:
      "When AI discusses your category, which brands does it highlight? Track how your share of the conversation shifts over time.",
  },
  {
    title: "Source Attribution",
    description:
      "Which websites does AI cite when discussing your industry? Are they your properties — or your competitors'?",
  },
  {
    title: "Platform Comparison",
    description:
      "ChatGPT and Gemini can frame your brand very differently. See which platforms help or hurt your positioning.",
  },
  {
    title: "Weekly Reports",
    description:
      "Automated reports with visibility scores, competitor alerts, and narrative shifts — delivered to your inbox.",
  },
];

export const BRAND_FEATURES_INTRO =
  "Built for marketing, comms, and brand teams that need to know how AI is shaping how customers find and perceive their brand.";

export const BRAND_PRICING_TIERS = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "Explore AI visibility for your brand",
    features: ["1 brand", "Weekly snapshots", "5 AI platforms", "Core dashboard"],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/mo",
    description: "For marketing teams tracking multiple brands or product lines",
    features: ["5 brands", "Daily snapshots", "5 AI platforms", "Full analytics", "Email reports", "CSV exports"],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For multi-brand companies and agencies",
    features: ["Unlimited brands", "Custom prompts", "API access", "Dedicated support", "SSO"],
    cta: "Contact Us",
    highlighted: false,
  },
];

export const BRAND_HOW_IT_WORKS = [
  {
    title: "Add your brand",
    description:
      "Enter your brand name. We generate targeted questions about your category for each AI platform.",
  },
  {
    title: "We ask the AI",
    description:
      "Real questions sent to real models \u2014 the same way customers and prospects use them.",
  },
  {
    title: "See what comes back",
    description:
      "Visibility scores, sentiment analysis, competitor tracking, and source citations. Updated on your schedule.",
  },
];

export const BRAND_BOTTOM_CTA = {
  headline:
    "Your brand is already part of the AI conversation. Find out how AI is framing your story.",
  cta: "Try it free",
};

export const BRAND_OG_IMAGE = {
  alt: "aiSaysWhat — AI brand visibility for companies and marketing teams",
  headline: "See what ChatGPT, Gemini & Claude say about your brand.",
  subtitle: "AI brand visibility for companies and marketing teams.",
};
