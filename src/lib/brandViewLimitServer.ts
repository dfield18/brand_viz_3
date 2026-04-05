import { prisma } from "@/lib/prisma";
import { PRESET_BRAND_SLUGS } from "./brandViewLimit";

/**
 * Check if a user has an active Pro subscription.
 */
export async function isProUser(userId: string): Promise<boolean> {
  const sub = await prisma.userSubscription.findUnique({ where: { userId } });
  return sub?.plan === "pro" && sub?.status === "active";
}

/**
 * Check if a user can access a brand.
 * Free tier: only preset brands. Pro tier: any brand.
 */
export async function canAccessBrand(brandSlug: string, userId: string): Promise<{ allowed: boolean; isPreset: boolean; isPro: boolean }> {
  const isPreset = PRESET_BRAND_SLUGS.includes(brandSlug);
  const isPro = await isProUser(userId);

  return { allowed: isPreset || isPro, isPreset, isPro };
}
