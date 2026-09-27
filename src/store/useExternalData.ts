"use client";

import { create } from "zustand";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import {
  validateFederalTaxYear,
  validateMedicarePartBYear,
  validateStateIncomeTaxYear,
} from "@/lib/externalData/validate";
import type { ReferenceData } from "@/lib/externalData/types";
import type { FederalTaxYear } from "@/lib/config/federalTax";
import type { MedicarePartBYear } from "@/lib/config/medicare";
import type { StateIncomeTaxYear } from "@/lib/config/stateTax";
import { withBasePath } from "@/lib/basePath";

const CACHE_KEY = "roth-external-data";
const TTL_MS = 24 * 60 * 60 * 1000;

type Status = "idle" | "loading" | "ready";

interface CacheBlob {
  fetchedAt: number;
  federalTax: FederalTaxYear;
  medicare: MedicarePartBYear;
  stateIncomeTax: StateIncomeTaxYear;
}

interface ExternalDataState {
  status: Status;
  refs: ReferenceData;
  error: string | null;
  /** True when refs came from committed fallback (offline / empty DB). */
  usedFallback: boolean;
  hydrate: () => Promise<void>;
}

function readCache(): CacheBlob | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as CacheBlob).fetchedAt !== "number"
    ) {
      return null;
    }
    const blob = parsed as CacheBlob;
    const tax = validateFederalTaxYear(blob.federalTax, {
      allowRateChange: true,
    });
    const medicare = validateMedicarePartBYear(blob.medicare, {
      allowRateChange: true,
    });
    const state = validateStateIncomeTaxYear(blob.stateIncomeTax);
    if (!tax.ok || !medicare.ok || !state.ok) return null;
    return {
      fetchedAt: blob.fetchedAt,
      federalTax: tax.value,
      medicare: medicare.value,
      stateIncomeTax: state.value,
    };
  } catch {
    return null;
  }
}

function writeCache(refs: ReferenceData): void {
  if (typeof window === "undefined") return;
  const blob: CacheBlob = {
    fetchedAt: Date.now(),
    federalTax: refs.federalTax,
    medicare: refs.medicare,
    stateIncomeTax: refs.stateIncomeTax,
  };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(blob));
  } catch {
    // Quota / private mode: ignore; in-memory refs still work this session.
  }
}

async function fetchDataset(
  key: "federal-tax" | "medicare" | "state-income-tax",
): Promise<unknown | null> {
  const res = await fetch(withBasePath(`/api/external-data?key=${key}`));
  if (!res.ok) return null;
  const body = (await res.json()) as { record?: { data?: unknown } };
  return body.record?.data ?? null;
}

async function fetchRefs(): Promise<ReferenceData | null> {
  const [taxRaw, medicareRaw, stateRaw] = await Promise.all([
    fetchDataset("federal-tax"),
    fetchDataset("medicare"),
    fetchDataset("state-income-tax"),
  ]);
  if (taxRaw == null || medicareRaw == null || stateRaw == null) return null;
  const tax = validateFederalTaxYear(taxRaw, { allowRateChange: true });
  const medicare = validateMedicarePartBYear(medicareRaw, {
    allowRateChange: true,
  });
  const state = validateStateIncomeTaxYear(stateRaw);
  if (!tax.ok || !medicare.ok || !state.ok) return null;
  return {
    federalTax: tax.value,
    medicare: medicare.value,
    stateIncomeTax: state.value,
  };
}

let hydratePromise: Promise<void> | null = null;

export const useExternalData = create<ExternalDataState>((set, get) => ({
  status: "idle",
  refs: FALLBACK_REFERENCE_DATA,
  error: null,
  usedFallback: true,

  hydrate: async () => {
    if (get().status === "ready") return;
    if (hydratePromise) return hydratePromise;

    hydratePromise = (async () => {
      set({ status: "loading", error: null });

      const cached = readCache();
      if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
        set({
          status: "ready",
          refs: {
            federalTax: cached.federalTax,
            medicare: cached.medicare,
            stateIncomeTax: cached.stateIncomeTax,
          },
          usedFallback: false,
          error: null,
        });
        return;
      }

      try {
        const refs = await fetchRefs();
        if (refs) {
          writeCache(refs);
          set({
            status: "ready",
            refs,
            usedFallback: false,
            error: null,
          });
          return;
        }
        set({
          status: "ready",
          refs: FALLBACK_REFERENCE_DATA,
          usedFallback: true,
          error: "External data unavailable; using committed fallback.",
        });
      } catch (err) {
        set({
          status: "ready",
          refs: FALLBACK_REFERENCE_DATA,
          usedFallback: true,
          error:
            err instanceof Error
              ? err.message
              : "External data fetch failed; using committed fallback.",
        });
      }
    })().finally(() => {
      hydratePromise = null;
    });

    return hydratePromise;
  },
}));

/** Kick off hydrate once from the app shell. */
export function ensureExternalDataHydrated(): void {
  void useExternalData.getState().hydrate();
}
