/**
 * Pure, dependency-free slug helpers safe for both client and server.
 * `brandAccess.ts` re-exports these for the server code paths that
 * also need them — keeping the file free of Clerk / server-only
 * imports means any React component can consume them directly.
 */

// Loose shape check for ephemeral free-tier slugs — matches both the
// current `<base>--<8 hex>` form and the legacy `<base>--cached` form
// that still exists on old rows. UX-surface check only; for security
// (public-viewability), use isPubliclyViewableBrand in brandAccess.ts
// which ALSO verifies the hex suffix equals sha256(base).slice(0, 8).
const EPHEMERAL_SHAPE_PATTERN = /--(cached|[0-9a-f]{8})$/;

/** True if the slug LOOKS like a free-tier ephemeral run (either the
 *  legacy `<base>--cached` marker or the current `<base>--<8 hex>`
 *  shape). Does NOT verify the hash. */
export function isEphemeralSlugShape(slug: string): boolean {
  return EPHEMERAL_SHAPE_PATTERN.test(slug);
}

/** Return the slug with any ephemeral suffix stripped — used for
 *  display when brand-info hasn't loaded yet. `apple--a1b2c3d4` →
 *  `apple`, `nike--cached` → `nike`, `foo` → `foo`. */
export function stripEphemeralSuffix(slug: string): string {
  return slug.replace(EPHEMERAL_SHAPE_PATTERN, "");
}
