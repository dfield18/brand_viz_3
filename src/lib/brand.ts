import { prisma } from "@/lib/prisma";
import { titleCase } from "@/lib/utils";

/**
 * Validate that a slug matches one of the two shapes the app actually
 * produces. Rejects anything else so user-controlled input can't
 * pollute the Brand table with arbitrary strings (unicode mischief,
 * path-traversal-shaped names, forged legacy markers, etc.).
 *
 * Two valid shapes:
 *   - Pro slug: lowercase alphanumeric words joined by single hyphens
 *     (e.g. `nike`, `mayors-against-illegal-guns`). The Pro slugifier
 *     at src/components/Header.tsx:120 collapses non-alphanumerics
 *     to a single `-`, so no real user input can produce `--`.
 *   - Free-run ephemeral slug: a Pro-shaped base + `--` + 8 hex chars
 *     (e.g. `nike--a1b2c3d4`). Hash verification against
 *     sha256(base).slice(0,8) is enforced elsewhere (brandAccess.ts).
 *
 * 1–80 chars. Case-sensitive lowercase match.
 */
export function isValidBrandSlug(slug: string): boolean {
  if (typeof slug !== "string") return false;
  if (slug.length === 0 || slug.length > 80) return false;
  const PRO_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  // Current ephemeral shape is `--<8 hex>`; the legacy `--cached`
  // suffix is accepted so Pro callers can still operate on older
  // free-run rows that haven't aged out of the DB.
  const EPHEMERAL_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*--(cached|[0-9a-f]{8})$/;
  return PRO_SHAPE.test(slug) || EPHEMERAL_SHAPE.test(slug);
}

/**
 * Find a brand by slug, or create it if it doesn't exist.
 * Handles race conditions (P2002 unique constraint violation on
 * concurrent creates). Throws if the slug fails shape validation so
 * every caller path gets the guard — not just the API routes that
 * remember to validate upstream.
 */
export async function findOrCreateBrand(slug: string) {
  if (!isValidBrandSlug(slug)) {
    throw new Error(`Invalid brand slug: ${JSON.stringify(slug)}`);
  }
  let brand = await prisma.brand.findUnique({ where: { slug } });
  if (!brand) {
    try {
      brand = await prisma.brand.create({
        data: { name: titleCase(slug), slug },
      });
    } catch (e: unknown) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code: string }).code === "P2002"
      ) {
        brand = await prisma.brand.findUnique({ where: { slug } });
      }
      if (!brand) throw e;
    }
  }
  return brand;
}
