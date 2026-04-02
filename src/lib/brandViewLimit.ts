import { prisma } from "@/lib/prisma";

const FREE_TIER_DAILY_LIMIT = 5;

/**
 * Check if a user can view a brand today (free tier: 5 unique brands/day).
 * Records the view if allowed. Returns { allowed, viewedToday, limit }.
 */
export async function checkAndRecordBrandView(
  userId: string,
  brandSlug: string,
): Promise<{ allowed: boolean; viewedToday: number; limit: number; brandsToday: string[] }> {
  const today = new Date().toISOString().slice(0, 10);

  // Get all brands this user has viewed today
  const todaysViews = await prisma.brandView.findMany({
    where: { userId, date: today },
    select: { brandSlug: true },
  });

  const brandsToday = [...new Set(todaysViews.map((v) => v.brandSlug))];

  // If this brand was already viewed today, always allow (doesn't count as new)
  if (brandsToday.includes(brandSlug)) {
    return { allowed: true, viewedToday: brandsToday.length, limit: FREE_TIER_DAILY_LIMIT, brandsToday };
  }

  // Check if at limit
  if (brandsToday.length >= FREE_TIER_DAILY_LIMIT) {
    return { allowed: false, viewedToday: brandsToday.length, limit: FREE_TIER_DAILY_LIMIT, brandsToday };
  }

  // Record the new view
  await prisma.brandView.upsert({
    where: { userId_brandSlug_date: { userId, brandSlug, date: today } },
    create: { userId, brandSlug, date: today },
    update: {},
  });

  return { allowed: true, viewedToday: brandsToday.length + 1, limit: FREE_TIER_DAILY_LIMIT, brandsToday: [...brandsToday, brandSlug] };
}
