import { looksLikePersonName } from "@/lib/personNameHeuristic";

/**
 * Pick the right noun to refer to an entity in user-facing copy.
 *
 * For non-political brands this always returns "brand". For entities
 * classified as political_advocacy, the name shape decides:
 *   - "Bernie Sanders", "Donald Trump", "Beyoncé" → "public figure"
 *   - "ACLU", "Mayors Against Illegal Guns", "Planned Parenthood" → "organization"
 *
 * Delegates the person-vs-org test to the shared looksLikePersonName
 * heuristic so the prompt generator and copy-renderer always agree.
 */
export function subjectNoun(brandName: string, category?: string | null): string {
  if (category !== "political_advocacy") return "brand";
  if (looksLikePersonName(brandName)) return "public figure";
  return "organization";
}

/** Plural form for sentences like "...describes these brands / public figures / organizations." */
export function subjectNounPlural(brandName: string, category?: string | null): string {
  const noun = subjectNoun(brandName, category);
  if (noun === "public figure") return "public figures";
  if (noun === "organization") return "organizations";
  return "brands";
}
