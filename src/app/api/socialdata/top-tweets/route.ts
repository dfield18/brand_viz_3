import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  NUCLEAR_ENERGY_SEARCH_QUERY,
  getTopTweetsForNuclearEnergy,
  getTweetText,
} from "@/lib/socialdata";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const limitParam = request.nextUrl.searchParams.get("limit");
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const limit = limitParam ? Number(limitParam) : undefined;

  if (limitParam && (limit === undefined || !Number.isInteger(limit) || limit < 1 || limit > 100)) {
    return NextResponse.json(
      { error: "limit must be an integer between 1 and 100" },
      { status: 400 },
    );
  }

  try {
    const result = await getTopTweetsForNuclearEnergy({
      cursor,
      limit,
    });

    return NextResponse.json({
      query: NUCLEAR_ENERGY_SEARCH_QUERY,
      type: "Top",
      count: result.tweets.length,
      nextCursor: result.next_cursor ?? null,
      tweets: result.tweets.map((tweet) => ({
        id: tweet.id_str,
        createdAt: tweet.tweet_created_at,
        text: getTweetText(tweet),
        url: `https://x.com/${tweet.user.screen_name}/status/${tweet.id_str}`,
        lang: tweet.lang ?? null,
        metrics: {
          likes: tweet.favorite_count ?? 0,
          replies: tweet.reply_count ?? 0,
          reposts: tweet.retweet_count ?? 0,
          quotes: tweet.quote_count ?? 0,
          views: tweet.views_count ?? 0,
          bookmarks: tweet.bookmark_count ?? 0,
        },
        user: {
          id: tweet.user.id_str,
          name: tweet.user.name,
          handle: tweet.user.screen_name,
          verified: Boolean(tweet.user.verified),
          followers: tweet.user.followers_count ?? 0,
          avatarUrl: tweet.user.profile_image_url_https ?? null,
        },
      })),
    });
  } catch (error) {
    const message = toErrorMessage(error);
    const status = message.includes("Missing SOCIALDATA_API_KEY") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
