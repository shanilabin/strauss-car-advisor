"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "./client";
import type { components } from "./schema";

export type ConfigSummary = components["schemas"]["ConfigSummary"];
export type CatalogCar = components["schemas"]["CatalogCar"];
export type Occupation = components["schemas"]["Occupation"];

/** GET /v1/config — active rules for the "why?" popover. */
export function useConfig() {
  return useQuery({
    queryKey: ["config"] as const,
    queryFn: async (): Promise<ConfigSummary> => {
      const { data, response } = await api.GET("/v1/config");
      if (!response.ok || !data) {
        throw new Error("טעינת הקונפיג נכשלה");
      }
      return data;
    },
    staleTime: 60_000,
  });
}

/** GET /v1/catalog — car list for resolving catalog[…] source refs. */
export function useCatalog() {
  return useQuery({
    queryKey: ["catalog"] as const,
    queryFn: async (): Promise<CatalogCar[]> => {
      const { data, response } = await api.GET("/v1/catalog");
      if (!response.ok || !data) {
        throw new Error("טעינת הקטלוג נכשלה");
      }
      return data;
    },
    staleTime: 60_000,
  });
}

/** GET /v1/occupations — for resolving occupations[…] source refs. */
export function useOccupations() {
  return useQuery({
    queryKey: ["occupations"] as const,
    queryFn: async (): Promise<Occupation[]> => {
      const { data, response } = await api.GET("/v1/occupations");
      if (!response.ok || !data) {
        throw new Error("טעינת העיסוקים נכשלה");
      }
      return data;
    },
    staleTime: 60_000,
  });
}
