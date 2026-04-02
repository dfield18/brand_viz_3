/**
 * Free tier brand access control.
 *
 * Free users can view a curated set of preset demo brands.
 * Paid users (once Stripe is integrated) can add and view any brand.
 *
 * To change the preset brands, edit the PRESET_BRAND_SLUGS array.
 */

export const PRESET_BRAND_SLUGS = [
  "aclu",
  "aipac",
  "common-cause",
  "fairshake",
  "adl",
];

/**
 * Check if a user can access a brand.
 * Free tier: only preset brands. Paid tier: any brand.
 *
 * TODO: Check Stripe subscription status for paid users.
 */
export function canAccessBrand(brandSlug: string, _userId: string): { allowed: boolean; isPreset: boolean } {
  const isPreset = PRESET_BRAND_SLUGS.includes(brandSlug);

  // TODO: Once Stripe is integrated, check subscription here:
  // const isPaid = await checkStripeSubscription(userId);
  // if (isPaid) return { allowed: true, isPreset };
  const isPaid = false;

  return { allowed: isPreset || isPaid, isPreset };
}
