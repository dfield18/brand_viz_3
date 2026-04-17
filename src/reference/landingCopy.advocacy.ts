/**
 * Landing page copy (advocacy / nonprofit / political-organization edition).
 *
 * This is the original landing page voice from when aiSaysWhat was pitched at
 * advocacy organizations and campaigns. It has been superseded on the live
 * landing page (src/app/page.tsx) by a more generic company/brand-focused voice.
 *
 * Not imported anywhere. Kept as a reference so the advocacy-focused language
 * can be restored, reused on a segment-specific landing page, or adapted for
 * targeted campaigns later.
 */

export const ADVOCACY_METADATA = {
  title: "aiSaysWhat — See what ChatGPT, Gemini & Claude say about your cause",
  description:
    "AI brand visibility for advocacy organizations and campaigns. Monitor how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe your cause. Track sentiment, peer organizations, and source citations. Start free.",
};

export const ADVOCACY_ROOT_DESCRIPTION =
  "Monitor how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe your organization and your mission. Visibility scores, sentiment analysis, peer tracking, and source citations — all on one dashboard.";

export const ADVOCACY_OG_DESCRIPTION =
  "Monitor how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe your organization and your mission.";

export const ADVOCACY_STRUCTURED_DATA = {
  softwareApplicationDescription:
    "AI brand visibility platform for advocacy organizations. Monitors how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe your organization — with visibility scores, sentiment analysis, peer tracking, and source citations.",
  organizationDescription:
    "AI brand visibility for advocacy organizations and campaigns.",
};

export const ADVOCACY_HERO = {
  headline: "AI is shaping how people understand your cause.",
  subheadline: "Do you know what it\u2019s saying?",
  description:
    "aiSaysWhat monitors how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe your organization and your mission.",
  cta: "Try it free",
  footnote: "By signing up you agree to receive occasional updates from aiSaysWhat.",
};

export const ADVOCACY_FEATURES = [
  {
    title: "Brand Recall",
    description:
      "When voters ask AI about your policy area, how often does your organization come up?",
  },
  {
    title: "Sentiment & Narrative",
    description:
      "Is AI framing your organization positively or negatively? What narratives is it spreading about your cause?",
  },
  {
    title: "Competitive Share",
    description:
      "When AI discusses your issue, which organizations does it highlight? Track how your share of the conversation shifts over time.",
  },
  {
    title: "Source Attribution",
    description:
      "Which websites does AI cite when discussing your issues? Are they your publications — or your opponents'?",
  },
  {
    title: "Platform Comparison",
    description:
      "ChatGPT and Gemini can frame your organization very differently. See which platforms help or hurt your message.",
  },
  {
    title: "Weekly Reports",
    description:
      "Automated reports with visibility scores, peer organization alerts, and narrative shifts — delivered to your inbox.",
  },
];

export const ADVOCACY_FEATURES_INTRO =
  "Built for advocacy organizations and campaigns that need to know how AI is shaping their public narrative.";

export const ADVOCACY_PRICING_TIERS = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "Explore AI visibility for your organization",
    features: ["1 organization", "Weekly snapshots", "5 AI platforms", "Core dashboard"],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/mo",
    description: "For campaigns and advocacy teams tracking multiple issues",
    features: ["5 organizations", "Daily snapshots", "5 AI platforms", "Full analytics", "Email reports", "CSV exports"],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For coalitions and national organizations",
    features: ["Unlimited organizations", "Custom prompts", "API access", "Dedicated support", "SSO"],
    cta: "Contact Us",
    highlighted: false,
  },
];

export const ADVOCACY_HOW_IT_WORKS = [
  {
    title: "Add your organization",
    description:
      "Enter your organization\u2019s name. We generate targeted questions about your issue area for each AI platform.",
  },
  {
    title: "We ask the AI",
    description:
      "Real questions sent to real models \u2014 the same way voters and donors use them.",
  },
  {
    title: "See what comes back",
    description:
      "Visibility scores, sentiment analysis, peer organization tracking, and source citations. Updated on your schedule.",
  },
];

export const ADVOCACY_BOTTOM_CTA = {
  headline:
    "Your organization is already part of the AI conversation. Find out how AI is framing your cause.",
  cta: "Try it free",
};
