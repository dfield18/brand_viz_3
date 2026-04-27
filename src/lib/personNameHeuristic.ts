/**
 * Heuristic to decide whether a string "looks like" a person's name.
 * Used to gate the public-figure classifier (so we don't burn an LLM
 * call on obvious orgs) AND to choose between "public figure" /
 * "organization" / "brand" nouns in user-facing copy.
 *
 * No external dependencies — safe to import from client components
 * without pulling the openai-dependent generateFeaturePrompts module
 * into the browser bundle.
 *
 * Accepts:
 *   - 2 to 4 capitalized tokens: "Mike Pence", "Hillary Rodham
 *     Clinton", "Maria de la Cruz".
 *   - Single capitalized name of ≥4 chars: "Beyoncé", "Madonna",
 *     "Pelé", "Lula", "Trudeau". (Catches mononymous celebrities and
 *     last-name-only references.) The 4-char floor avoids matching
 *     short tokens that often sit alone in product names ("USA",
 *     "API", "AWS", "MIT"). Real names below 4 chars are rare enough
 *     that users typing "Cher" / "Dre" are well served by also
 *     entering them in 2-token form.
 *   - Accented Latin characters (À–ÿ): "Beyoncé", "François",
 *     "Häagen", "Açai".
 *
 * Rejects names containing organization signal words (Foundation,
 * Society, Coalition, etc.) so an entity like "Common Cause
 * Foundation" never trips the person classifier.
 */

const SINGLE_NAME_SHAPE = /^[A-Z][a-zA-Z\u00C0-\u017F'\-]{3,}$/;
const MULTI_NAME_SHAPE = /^[A-Z][a-zA-Z\u00C0-\u017F'\-]+( [A-Z][a-zA-Z\u00C0-\u017F'\-]+){1,3}$/;
export const PERSON_NAME_SHAPE_RE = new RegExp(
  `(${SINGLE_NAME_SHAPE.source.slice(1, -1)})|(${MULTI_NAME_SHAPE.source.slice(1, -1)})`,
);
export const ORG_SIGNAL_WORDS_RE = /\b(Foundation|Society|Union|Coalition|Alliance|Committee|Council|Association|Fund|PAC|Institute|Center|Project|Campaign|Party|Caucus|Action|Network|LLC|Inc|Corp|Co|Forum|Cause|League|Federation|Trust|Watch|Matters|Rights|Parenthood)\b/i;

export function looksLikePersonName(name: string | undefined | null): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  // Run against re-anchored full-match patterns so the source-shared
  // regexes don't false-positive on substrings.
  const single = SINGLE_NAME_SHAPE.test(trimmed);
  const multi = MULTI_NAME_SHAPE.test(trimmed);
  if (!single && !multi) return false;
  if (ORG_SIGNAL_WORDS_RE.test(trimmed)) return false;
  return true;
}
