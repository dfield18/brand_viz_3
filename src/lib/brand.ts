import { prisma } from "@/lib/prisma";
import { titleCase } from "@/lib/utils";

/**
 * Find a brand by slug, or create it if it doesn't exist.
 * Handles race conditions (P2002 unique constraint violation on concurrent creates).
 */
export async function findOrCreateBrand(slug: string) {
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
