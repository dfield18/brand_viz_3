const SOCIALDATA_SEARCH_URL = "https://api.socialdata.tools/twitter/search";

export const NUCLEAR_ENERGY_SEARCH_QUERY = "\"nuclear energy\"";

export type SocialDataSearchType = "Latest" | "Top";

export interface SocialDataUser {
  id_str: string;
  name: string;
  screen_name: string;
  verified?: boolean;
  followers_count?: number;
  profile_image_url_https?: string;
}

export interface SocialDataTweet {
  tweet_created_at: string;
  id_str: string;
  text: string | null;
  full_text: string | null;
  source?: string;
  lang?: string;
  user: SocialDataUser;
  quote_count?: number;
  reply_count?: number;
  retweet_count?: number;
  favorite_count?: number;
  views_count?: number;
  bookmark_count?: number;
}

export interface SocialDataSearchResponse {
  next_cursor?: string;
  tweets: SocialDataTweet[];
}

export interface SearchTweetsInput {
  query: string;
  type?: SocialDataSearchType;
  cursor?: string;
  signal?: AbortSignal;
}

export interface TopNuclearEnergyTweetsInput {
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
}

function getApiKey(): string {
  const apiKey = process.env.SOCIALDATA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing SOCIALDATA_API_KEY environment variable");
  }
  return apiKey;
}

export function getTweetText(tweet: SocialDataTweet): string {
  return tweet.full_text ?? tweet.text ?? "";
}

export async function searchTweets({
  query,
  type = "Latest",
  cursor,
  signal,
}: SearchTweetsInput): Promise<SocialDataSearchResponse> {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    query,
    type,
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  const response = await fetch(`${SOCIALDATA_SEARCH_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: signal ?? AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`SocialData search failed with ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = await response.json() as SocialDataSearchResponse;

  if (!Array.isArray(data.tweets)) {
    throw new Error("SocialData response did not include a tweets array");
  }

  return data;
}

export async function getTopTweetsForNuclearEnergy({
  cursor,
  limit,
  signal,
}: TopNuclearEnergyTweetsInput = {}): Promise<SocialDataSearchResponse> {
  const data = await searchTweets({
    query: NUCLEAR_ENERGY_SEARCH_QUERY,
    type: "Top",
    cursor,
    signal,
  });

  if (typeof limit === "number") {
    return {
      ...data,
      tweets: data.tweets.slice(0, Math.max(0, limit)),
    };
  }

  return data;
}
