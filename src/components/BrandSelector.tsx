"use client";

import { Brand } from "@/types/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
}

export function BrandSelector({
  brands,
  currentSlug,
  currentBrandName,
  onSelect,
  onAddBrand,
}: BrandSelectorProps) {
  const current = brands.find((b) => b.slug === currentSlug);
  const label = current?.name ?? currentBrandName ?? "Select Brand";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          {label}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onSelect={() => onAddBrand()}>
          + Add Brand
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {brands.length === 0 && (
          <DropdownMenuItem disabled className="text-muted-foreground">
            No brands yet
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
