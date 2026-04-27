/**
 * Pick the right noun to refer to an entity in user-facing copy.
 *
 * For non-political brands this always returns "brand". For entities
 * classified as political_advocacy, the name shape decides:
 *   - "Bernie Sanders", "Donald Trump" → "public figure"
 *   - "ACLU", "Mayors Against Illegal Guns", "Planned Parenthood" → "organization"
 *
 * Works off classifyBrandCategory's two-bucket output since the
 * classifier has no "public_figure" bucket. The orgSignal regex stops
 * proper-cased org names (Planned Parenthood, Common Cause) from
 * slipping into the public-figure branch.
 */
export function subjectNoun(brandName: string, category?: string | null): string {
  if (category !== "political_advocacy") return "brand";
  const name = brandName.trim();
  // Allow 2–4 tokens to handle middle-name forms like "Hillary Rodham
  // Clinton" or "John Fitzgerald Kennedy". Matches the looksLikePersonName
  // regex in generateFeaturePrompts.ts so the noun decision agrees with
  // the prompt-generator path.
  const looksLikePerson = /^[A-Z][a-zA-Z'-]+( [A-Z][a-zA-Z'-]+){1,3}$/.test(name);
  const orgSignal =
    /\b(Foundation|Society|Union|Coalition|Alliance|Institute|Council|Forum|Network|Cause|Fund|PAC|Action|Matters|Watch|Party|Project|Committee|Center|Parenthood|Rights|Trust|League|Federation|Association)\b/i;
  if (looksLikePerson && !orgSignal.test(name)) return "public figure";
  return "organization";
}

/** Plural form for sentences like "...describes these brands / public figures / organizations." */
export function subjectNounPlural(brandName: string, category?: string | null): string {
  const noun = subjectNoun(brandName, category);
  if (noun === "public figure") return "public figures";
  if (noun === "organization") return "organizations";
  return "brands";
}
