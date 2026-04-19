'use client';

import { useState, useCallback } from 'react';
import type { SectorTarget, Sector } from '@/lib/types';

export function TargetInputs({
  sectors,
  targets,
  onTargetsChange,
  targetSum,
}: {
  sectors: Sector[];
  targets: SectorTarget[];
  onTargetsChange: (targets: SectorTarget[]) => void;
  targetSum: number;
}) {
  const [editingWeights, setEditingWeights] = useState<string | null>(null);

  const updateTarget = useCallback(
    (sectorName: string, value: number) => {
      const updated = targets.map((t) =>
        t.sectorName === sectorName ? { ...t, targetPct: value } : t
      );
      onTargetsChange(updated);
    },
    [targets, onTargetsChange]
  );

  const updateTickerWeight = useCallback(
    (sectorName: string, ticker: string, weight: number) => {
      const updated = targets.map((t) => {
        if (t.sectorName !== sectorName) return t;
        const weights = { ...(t.tickerWeights ?? {}) };
        weights[ticker] = weight;
        return { ...t, tickerWeights: weights };
      });
      onTargetsChange(updated);
    },
    [targets, onTargetsChange]
  );

  const resetToEqualWeight = useCallback(
    (sectorName: string) => {
      const updated = targets.map((t) =>
        t.sectorName === sectorName
          ? { ...t, tickerWeights: undefined }
          : t
      );
      onTargetsChange(updated);
    },
    [targets, onTargetsChange]
  );

  const isValid = Math.abs(targetSum - 100) <= 0.1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display font-semibold text-sm text-text">
          Target Allocations
        </h3>
        <span
          className={`text-sm font-mono tabular-nums font-semibold ${
            isValid ? 'text-gain' : 'text-loss'
          }`}
        >
          {targetSum.toFixed(1)}%
        </span>
      </div>
      {!isValid && (
        <p className="text-xs text-loss">
          Targets must sum to 100% (currently {targetSum.toFixed(1)}%)
        </p>
      )}
      {sectors.map((sector) => {
        const target = targets.find((t) => t.sectorName === sector.name);
        const value = target?.targetPct ?? 0;
        const isEditingWeightsForSector = editingWeights === sector.name;
        const tickerCount = sector.holdings.length;

        return (
          <div key={sector.name} className="border border-border rounded-md p-3">
            <div className="flex items-center gap-3">
              <label className="flex-1 text-sm font-display font-medium text-text">
                {sector.name}
              </label>
              <span className="text-sm font-mono tabular-nums text-text w-24 text-right">
                ${sector.totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
              <span className="text-sm font-mono tabular-nums text-text-muted w-14 text-right">
                {sector.pct.toFixed(1)}%
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  value={value}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    updateTarget(sector.name, isNaN(v) ? 0 : v);
                  }}
                  className="no-spinner w-16 px-2 py-1.5 text-sm font-mono tabular-nums text-right border border-border rounded bg-surface text-text focus:outline-none focus:border-accent"
                  aria-label={`Target allocation for ${sector.name}`}
                />
                <span className="text-sm text-text-muted">%</span>
              </div>
            </div>
            {tickerCount > 1 && (
              <div className="mt-1">
                <button
                  onClick={() =>
                    setEditingWeights(
                      isEditingWeightsForSector ? null : sector.name
                    )
                  }
                  className="text-xs text-accent hover:text-accent-hover"
                >
                  {isEditingWeightsForSector
                    ? 'Hide weights'
                    : 'Edit weights'}
                </button>
              </div>
            )}
            {isEditingWeightsForSector && (
              <div className="mt-2 pl-2 space-y-1.5 border-l-2 border-accent-light">
                {sector.holdings.map((h) => {
                  const equalWeight = 100 / tickerCount;
                  const tickerWeight =
                    target?.tickerWeights?.[h.ticker] ?? equalWeight;
                  return (
                    <div
                      key={h.ticker}
                      className="flex items-center gap-2"
                    >
                      <span className="text-xs font-mono text-text w-16">
                        {h.ticker}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="100"
                        step="1"
                        value={Math.round(tickerWeight * 10) / 10}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          updateTickerWeight(
                            sector.name,
                            h.ticker,
                            isNaN(v) ? 0 : v
                          );
                        }}
                        className="w-16 px-2 py-1 text-xs font-mono tabular-nums text-right border border-border rounded bg-surface text-text focus:outline-none focus:border-accent"
                      />
                      <span className="text-xs text-text-muted">%</span>
                    </div>
                  );
                })}
                <button
                  onClick={() => resetToEqualWeight(sector.name)}
                  className="text-xs text-accent hover:text-accent-hover mt-1"
                >
                  Reset to equal weight
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
