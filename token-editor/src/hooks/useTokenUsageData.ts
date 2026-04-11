'use client';

import { useEffect, useState } from 'react';
import type { TokenUsagePayload } from '@/types/tokenUsage';

let cached: TokenUsagePayload | null | undefined;

export type UsageHeat = 'high' | 'mid' | 'low';

function percentileCutoffs(totals: number[], p: number): number {
  if (totals.length === 0) return 0;
  const i = Math.min(totals.length - 1, Math.max(0, Math.floor((p / 100) * totals.length)));
  return totals[i];
}

/** Resolve thresholds when JSON used legacy all-zero percentiles (many unused primitives). */
export function effectiveUsageThresholds(data: TokenUsagePayload): { highMin: number; lowMax: number } {
  const { highMinCount, lowMaxCount } = data.thresholds;
  if (highMinCount > 0 || lowMaxCount > 0) {
    return { highMin: highMinCount, lowMax: lowMaxCount };
  }
  const nonzero = Object.values(data.primitives)
    .map((e) => e.total)
    .filter((t) => t > 0)
    .sort((a, b) => a - b);
  if (nonzero.length === 0) return { highMin: 1, lowMax: 0 };
  return {
    highMin: percentileCutoffs(nonzero, 66),
    lowMax: percentileCutoffs(nonzero, 33),
  };
}

export function usageHeatForTotal(data: TokenUsagePayload | null, total: number): UsageHeat | null {
  if (!data) return null;
  if (total <= 0) return 'low';
  const { highMin, lowMax } = effectiveUsageThresholds(data);
  if (total >= highMin) return 'high';
  if (total <= lowMax) return 'low';
  return 'mid';
}

export function useTokenUsageData() {
  const [data, setData] = useState<TokenUsagePayload | null>(cached === undefined ? null : cached);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(cached === undefined);

  useEffect(() => {
    if (cached !== undefined) {
      setData(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch('/token-usage.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: TokenUsagePayload) => {
        if (cancelled) return;
        cached = j;
        setData(j);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        cached = null;
        setData(null);
        setError('unavailable');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error, loading };
}
