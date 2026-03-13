// Stub — will be replaced with real API calls in a future phase.

import { Brand, Filters, OverviewResponse, NarrativeResponse, VisibilityResponse, CompetitionResponse, LegacyTopicsResponse } from "@/types/api";

export const apiClient = {
  listBrands(): Brand[] {
    throw new Error("apiClient.listBrands not implemented");
  },

  createBrand(_input: { name: string }): Brand {
    throw new Error("apiClient.createBrand not implemented");
  },

  getLastViewedBrand(): string | null {
    throw new Error("apiClient.getLastViewedBrand not implemented");
  },

  getOverview(_brandId: string, _filters: Filters): OverviewResponse {
    throw new Error("apiClient.getOverview not implemented");
  },

  getNarrative(_brandId: string, _filters: Filters): NarrativeResponse {
    throw new Error("apiClient.getNarrative not implemented");
  },

  getVisibility(_brandId: string, _filters: Filters): VisibilityResponse {
    throw new Error("apiClient.getVisibility not implemented");
  },

  getCompetition(_brandId: string, _filters: Filters): CompetitionResponse {
    throw new Error("apiClient.getCompetition not implemented");
  },

  getTopics(_brandId: string, _filters: Filters): LegacyTopicsResponse {
    throw new Error("apiClient.getTopics not implemented");
  },

  setLastViewedBrand(_slug: string): void {
    throw new Error("apiClient.setLastViewedBrand not implemented");
  },
};
