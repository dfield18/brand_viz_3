"use client";

import { parseResponse, highlightBrand, type FormattedSection } from "@/lib/formatResponse";

interface Props {
  text: string;
  brandName: string;
}

export function FormattedResponse({ text, brandName }: Props) {
  const sections = parseResponse(text);

  if (sections.length === 0) {
    return (
      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
        {text}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section, i) => (
        <SectionView key={i} section={section} brandName={brandName} />
      ))}
    </div>
  );
}

function SectionView({ section, brandName }: { section: FormattedSection; brandName: string }) {
  switch (section.type) {
    case "heading":
      return (
        <h3 className="text-sm font-semibold text-foreground pt-1">
          {section.text}
        </h3>
      );
    case "paragraph":
      return (
        <p className="text-sm leading-relaxed text-foreground">
          <HighlightedText text={section.text ?? ""} brandName={brandName} />
        </p>
      );
    case "list":
      if (section.ordered) {
        return (
          <ol className="space-y-1.5 pl-5 list-decimal">
            {section.items?.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed text-foreground">
                <HighlightedText text={item} brandName={brandName} />
              </li>
            ))}
          </ol>
        );
      }
      return (
        <ul className="space-y-1.5 pl-5 list-disc">
          {section.items?.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed text-foreground">
              <HighlightedText text={item} brandName={brandName} />
            </li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}

function HighlightedText({ text, brandName }: { text: string; brandName: string }) {
  const segments = highlightBrand(text, brandName);
  return (
    <>
      {segments.map((seg, i) =>
        seg.highlight ? (
          <mark key={i} className="bg-primary/15 text-primary font-medium rounded px-0.5">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}
