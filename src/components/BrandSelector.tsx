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
  onSelect: (slug: string) => void;
  onAddBrand: () => void;
}

export function BrandSelector({
  brands,
  currentSlug,
  onSelect,
  onAddBrand,
}: BrandSelectorProps) {
  const current = brands.find((b) => b.slug === currentSlug);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          {current?.name ?? "Select Brand"}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onAddBrand()}>
          + Add Brand
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
