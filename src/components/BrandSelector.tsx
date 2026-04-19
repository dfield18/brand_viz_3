"use client";

import { Brand } from "@/types/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

interface BrandSelectorProps {
  brands: Brand[];
  currentSlug: string | null;
  /** Fallback label when the current brand isn't in the user's own list
   *  (e.g. an anonymous free-tier visitor viewing a brand they just ran). */
  currentBrandName?: string;
  onSelect: (slug: string) => void;
  onAddBrand: () => void;
  /** Whether to show the "+ Add Brand" menu item. Hidden for anonymous
   *  visitors since the add-brand flow requires an account. */
  canAddBrand?: boolean;
  /** Curated brand names shown to anonymous visitors so they can jump
   *  straight into another free run from the dropdown. Ignored when
   *  canAddBrand is true (signed-in users see their real brand list
   *  instead of suggestions). */
  suggestedBrands?: string[];
  /** Click handler for a suggested-brand item. Typically navigates to
   *  the homepage with the brand pre-filled and auto-run. */
  onSuggestedSelect?: (brandName: string) => void;
  /** Click handler for the "+ New brand or public figure" item that
   *  sends anon users back to the hero input. */
  onSearchNew?: () => void;
}

export function BrandSelector({
  brands,
  currentSlug,
  currentBrandName,
  onSelect,
  onAddBrand,
  canAddBrand = true,
  suggestedBrands,
  onSuggestedSelect,
  onSearchNew,
}: BrandSelectorProps) {
  const current = brands.find((b) => b.slug === currentSlug);
  const label = current?.name ?? currentBrandName ?? "Select Brand";
  const showSuggestions = !canAddBrand && (suggestedBrands?.length ?? 0) > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 max-w-[60vw] sm:max-w-none">
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {canAddBrand && (
          <>
            <DropdownMenuItem onSelect={() => onAddBrand()}>
              + Add Brand
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Signed-out UX: instead of "Sign up to add brands", offer
            the same suggested brands from the homepage and a fallback
            "+ New brand" action. Let them keep exploring without an
            account. */}
        {showSuggestions && (
          <>
            <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Try another
            </DropdownMenuLabel>
            {suggestedBrands!.map((name) => (
              <DropdownMenuItem
                key={name}
                onSelect={() => onSuggestedSelect?.(name)}
              >
                {name}
              </DropdownMenuItem>
            ))}
            {onSearchNew && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onSearchNew()}>
                  + New brand or public figure
                </DropdownMenuItem>
              </>
            )}
          </>
        )}

        {!showSuggestions && brands.length === 0 && (
          <DropdownMenuItem disabled className="text-muted-foreground">
            {canAddBrand ? "No brands yet" : "Sign up to add brands"}
          </DropdownMenuItem>
        )}
        {[...brands]
          .sort((a, b) => {
            // Current brand first
            if (a.slug === currentSlug) return -1;
            if (b.slug === currentSlug) return 1;
            return a.name.localeCompare(b.name);
          })
          .map((brand) => (
          <DropdownMenuItem
            key={brand.id}
            onSelect={() => onSelect(brand.slug)}
            className={brand.slug === currentSlug ? "font-semibold" : ""}
          >
            {brand.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
