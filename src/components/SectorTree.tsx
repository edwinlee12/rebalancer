'use client';

import { useState } from 'react';
import type { Sector, PriceData, SectorTarget } from '@/lib/types';

type AddTickerResult = { ok: true } | { ok: false; error: string };

function formatMoney(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatPct(n: number): string {
  return n.toFixed(1) + '%';
}

export function SectorTree({
  sectors,
  prices,
  pricesFetchedAt,
  targets,
  onTargetsChange,
  targetSum,
  onAddTicker,
  onRemoveAddedTicker,
}: {
  sectors: Sector[];
  prices: Record<string, PriceData>;
  pricesFetchedAt?: number;
  targets: SectorTarget[];
  onTargetsChange: (targets: SectorTarget[]) => void;
  targetSum: number;
  onAddTicker?: (sectorName: string, ticker: string) => Promise<AddTickerResult>;
  onRemoveAddedTicker?: (sectorName: string, ticker: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addInputs, setAddInputs] = useState<Record<string, string>>({});
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [addPending, setAddPending] = useState<Record<string, boolean>>({});

  const submitAddTicker = async (sectorName: string) => {
    if (!onAddTicker) return;
    const value = (addInputs[sectorName] ?? '').trim();
    if (!value) return;
    setAddPending((p) => ({ ...p, [sectorName]: true }));
    setAddErrors((e) => ({ ...e, [sectorName]: '' }));
    const result = await onAddTicker(sectorName, value);
    setAddPending((p) => ({ ...p, [sectorName]: false }));
    if (result.ok) {
      setAddInputs((i) => ({ ...i, [sectorName]: '' }));
    } else {
      setAddErrors((e) => ({ ...e, [sectorName]: result.error }));
    }
  };

  const toggleSector = (name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const updateTarget = (sectorName: string, targetPct: number) => {
    onTargetsChange(
      targets.map((t) =>
        t.sectorName === sectorName ? { ...t, targetPct } : t
      )
    );
  };

  const updateTickerWeight = (
    sectorName: string,
    ticker: string,
    weight: number
  ) => {
    onTargetsChange(
      targets.map((t) => {
        if (t.sectorName !== sectorName) return t;
        const weights = { ...(t.tickerWeights ?? {}) };
        weights[ticker] = weight;
        return { ...t, tickerWeights: weights };
      })
    );
  };

  const isValid = Math.abs(targetSum - 100) <= 0.1;

  return (
    <div>
      {/* Header row with target sum */}
      <div className="flex items-center justify-between px-3 py-2 mb-2 border-b border-border">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          Sectors & Targets
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Target sum:</span>
          <span
            className={`text-sm font-mono tabular-nums font-semibold ${
              isValid ? 'text-gain' : 'text-loss'
            }`}
          >
            {targetSum.toFixed(1)}%
          </span>
        </div>
      </div>

      <div role="tree" className="space-y-1">
        {sectors.map((sector) => {
          const isOpen = expanded[sector.name] ?? false;
          const target = targets.find((t) => t.sectorName === sector.name);
          const targetValue = target?.targetPct ?? 0;
          const tickerCount = sector.holdings.length;
          const equalWeight = tickerCount > 0 ? 100 / tickerCount : 0;

          return (
            <div key={sector.name} role="treeitem" aria-expanded={isOpen}>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-md hover:bg-surface border border-transparent hover:border-border transition-colors">
                <button
                  onClick={() => toggleSector(sector.name)}
                  className="flex items-center gap-2 flex-1 text-left min-w-0"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span className="font-display font-semibold text-sm text-text truncate">
                    {sector.name}
                  </span>
                  <span className="text-xs text-text-muted flex-shrink-0">
                    ({tickerCount})
                  </span>
                </button>
                <div className="flex items-center gap-4 text-sm font-mono tabular-nums flex-shrink-0">
                  <span className="text-text w-24 text-right">
                    {formatMoney(sector.totalValue)}
                  </span>
                  <span className="text-text-muted w-14 text-right">
                    {formatPct(sector.pct)}
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="100"
                      value={targetValue}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        updateTarget(sector.name, isNaN(v) ? 0 : v);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="no-spinner w-16 px-2 py-1 text-sm font-mono tabular-nums text-right border border-border rounded bg-surface text-text focus:outline-none focus:border-accent"
                      aria-label={`Target allocation for ${sector.name}`}
                    />
                    <span className="text-xs text-text-muted">%</span>
                  </div>
                </div>
              </div>
              {isOpen && (
                <div className="ml-6 mt-1 mb-2 space-y-px" role="group">
                  {/* Desktop table header */}
                  <div className="hidden sm:grid grid-cols-[minmax(180px,1fr)_70px_90px_95px_130px_80px] gap-2 px-3 py-1.5 text-xs text-text-muted">
                    <span>Ticker</span>
                    <span className="text-right">Shares</span>
                    <span className="text-right">Price</span>
                    <span className="text-right">Value</span>
                    <span className="text-right">Gain/Loss</span>
                    <span className="text-right">Weight</span>
                  </div>
                  {sector.holdings.map((h) => {
                    const livePrice = prices[h.ticker];
                    const displayPrice = livePrice?.price ?? h.price;
                    const displayValue = h.shares * displayPrice;
                    const tickerWeight =
                      target?.tickerWeights?.[h.ticker] ?? equalWeight;
                    return (
                      <div
                        key={h.ticker}
                        className="hidden sm:grid grid-cols-[minmax(180px,1fr)_70px_90px_95px_130px_80px] gap-2 px-3 py-1.5 rounded hover:bg-surface/50 text-sm items-center"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="font-mono font-semibold text-text">
                            {h.ticker}
                          </span>
                          {h.isAdded && (
                            <span className="text-[10px] font-bold uppercase tracking-wide bg-accent-light text-accent px-1.5 py-0.5 rounded flex-shrink-0">
                              Added
                            </span>
                          )}
                          <span className="text-text-muted text-xs truncate">
                            {h.name}
                          </span>
                          {h.isAdded && onRemoveAddedTicker && (
                            <button
                              onClick={() =>
                                onRemoveAddedTicker(sector.name, h.ticker)
                              }
                              className="ml-auto p-0.5 text-text-muted hover:text-loss transition-colors flex-shrink-0"
                              aria-label={`Remove ${h.ticker} from ${sector.name}`}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <span className="text-right font-mono tabular-nums text-text">
                          {h.shares % 1 !== 0
                            ? h.shares.toFixed(3)
                            : h.shares.toLocaleString()}
                        </span>
                        <span
                          className={`text-right font-mono tabular-nums ${
                            livePrice ? 'text-live-blue' : 'text-text'
                          }`}
                        >
                          ${displayPrice.toFixed(2)}
                        </span>
                        <span className="text-right font-mono tabular-nums text-text">
                          {formatMoney(displayValue)}
                        </span>
                        <span
                          className={`text-right font-mono tabular-nums ${
                            h.gainLoss !== undefined
                              ? h.gainLoss >= 0
                                ? 'text-gain'
                                : 'text-loss'
                              : 'text-text-muted'
                          }`}
                        >
                          {h.gainLoss !== undefined && (
                            <>
                              {h.gainLoss >= 0 ? '\u25B2' : '\u25BC'}{' '}
                              {formatMoney(Math.abs(h.gainLoss))}
                            </>
                          )}
                        </span>
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            max="100"
                            value={Math.round(tickerWeight * 10) / 10}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              updateTickerWeight(
                                sector.name,
                                h.ticker,
                                isNaN(v) ? 0 : v
                              );
                            }}
                            className="no-spinner w-14 px-1.5 py-0.5 text-xs font-mono tabular-nums text-right border border-border rounded bg-surface text-text focus:outline-none focus:border-accent"
                            aria-label={`Weight for ${h.ticker} in ${sector.name}`}
                          />
                          <span className="text-xs text-text-muted">%</span>
                        </div>
                      </div>
                    );
                  })}
                  {onAddTicker && (
                    <div className="px-3 py-2 border-t border-border mt-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={addInputs[sector.name] ?? ''}
                          onChange={(e) =>
                            setAddInputs((i) => ({
                              ...i,
                              [sector.name]: e.target.value.toUpperCase(),
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              submitAddTicker(sector.name);
                            }
                          }}
                          placeholder="Add Ticker"
                          maxLength={10}
                          disabled={addPending[sector.name]}
                          className="w-[180px] px-2 py-1.5 text-sm font-mono border border-border rounded bg-surface text-text focus:outline-none focus:border-accent disabled:opacity-50"
                          aria-label={`Add new ticker to ${sector.name}`}
                        />
                        <button
                          onClick={() => submitAddTicker(sector.name)}
                          disabled={
                            addPending[sector.name] ||
                            !(addInputs[sector.name] ?? '').trim()
                          }
                          className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {addPending[sector.name] ? 'Adding…' : '+ Add'}
                        </button>
                      </div>
                      {addErrors[sector.name] && (
                        <p className="text-xs text-loss mt-1">
                          {addErrors[sector.name]}
                        </p>
                      )}
                    </div>
                  )}
                  {/* Mobile card layout */}
                  {sector.holdings.map((h) => {
                    const livePrice = prices[h.ticker];
                    const displayPrice = livePrice?.price ?? h.price;
                    const displayValue = h.shares * displayPrice;
                    const tickerWeight =
                      target?.tickerWeights?.[h.ticker] ?? equalWeight;
                    return (
                      <div
                        key={`mobile-${h.ticker}`}
                        className="sm:hidden p-3 rounded-md border border-border bg-surface mb-1"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-sm text-text">
                              {h.ticker}
                            </span>
                            {h.isAdded && (
                              <span className="text-[10px] font-bold uppercase tracking-wide bg-accent-light text-accent px-1.5 py-0.5 rounded">
                                Added
                              </span>
                            )}
                            {livePrice && (
                              <span className="text-[10px] bg-live-blue-light text-live-blue px-1 py-0.5 rounded font-medium">
                                Live
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono tabular-nums text-sm text-text">
                              {formatMoney(displayValue)}
                            </span>
                            {h.isAdded && onRemoveAddedTicker && (
                              <button
                                onClick={() =>
                                  onRemoveAddedTicker(sector.name, h.ticker)
                                }
                                className="p-0.5 text-text-muted hover:text-loss transition-colors"
                                aria-label={`Remove ${h.ticker} from ${sector.name}`}
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-text-muted truncate mb-1.5">
                          {h.name}
                        </p>
                        <div className="flex justify-between items-center text-xs text-text-muted font-mono tabular-nums">
                          <span>
                            {h.shares % 1 !== 0
                              ? h.shares.toFixed(3)
                              : h.shares}{' '}
                            shares @ ${displayPrice.toFixed(2)}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-text-muted">Weight:</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              max="100"
                              value={Math.round(tickerWeight * 10) / 10}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                updateTickerWeight(
                                  sector.name,
                                  h.ticker,
                                  isNaN(v) ? 0 : v
                                );
                              }}
                              className="no-spinner w-14 px-1.5 py-0.5 text-xs font-mono tabular-nums text-right border border-border rounded bg-bg text-text focus:outline-none focus:border-accent"
                            />
                            <span>%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!isValid && (
        <p className="text-xs text-loss mt-2 px-3">
          Targets must sum to 100% (currently {targetSum.toFixed(1)}%)
        </p>
      )}
      {pricesFetchedAt && (
        <p className="text-xs text-text-muted text-right mt-2 px-3">
          Prices as of {new Date(pricesFetchedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
