export const VALID_MODELS: string[] = ["chatgpt", "gemini", "claude", "perplexity", "google"];
export const VALID_RANGES: number[] = [7, 30, 90];

export const MODEL_LABELS: Record<string, string> = {
  all: "All Models",
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
  google: "Google AI Overview",
};

export const VALID_CLUSTERS: string[] = ["direct", "related", "comparative", "network", "industry"];

export const CLUSTER_LABELS: Record<string, string> = {
  all: "All Question Types",
  direct: "Direct",
  related: "Related",
  comparative: "Comparative",
  network: "Network",
  industry: "Industry",
};
