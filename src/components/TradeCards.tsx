'use client';

import { useState, useCallback } from 'react';
import type { Trade, Sector, PriceData } from '@/lib/types';

function formatMoney(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatMoneyExact(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

export function TradeCards({
  trades,
  sectors,
  prices,
  onTradesChange,
}: {
  trades: Trade[];
  sectors: Sector[];
  prices: Record<string, PriceData>;
  onTradesChange: (trades: Trade[]) => void;
}) {
  // Build lookup: ticker -> current holding value
  const holdingValue: Record<string, number> = {};
  // Per-share cost basis derived from the report: (value - gainLoss) / shares.
  // Undefined when the report omits gainLoss for that holding.
  const costBasisPerShare: Record<string, number | undefined> = {};
  for (const sector of sectors) {
    for (const h of sector.holdings) {
      const price = prices[h.ticker]?.price ?? h.price;
      holdingValue[h.ticker] = h.shares * price;
      costBasisPerShare[h.ticker] =
        h.gainLoss !== undefined && h.shares > 0
          ? (h.value - h.gainLoss) / h.shares
          : undefined;
    }
  }

  const estGainForSell = (trade: Trade): number | undefined => {
    if (trade.action !== 'sell') return undefined;
    const cb = costBasisPerShare[trade.ticker];
    if (cb === undefined) return undefined;
    return (trade.price - cb) * trade.shares;
  };
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleSector = (name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const updateShares = useCallback(
    (ticker: string, shares: number) => {
      if (shares <= 0) {
        onTradesChange(trades.filter((t) => t.ticker !== ticker));
        return;
      }
      onTradesChange(
        trades.map((t) =>
          t.ticker === ticker
            ? { ...t, shares, amount: shares * t.price }
            : t
        )
      );
    },
    [trades, onTradesChange]
  );

  const removeTrade = useCallback(
    (ticker: string) => {
      onTradesChange(trades.filter((t) => t.ticker !== ticker));
    },
    [trades, onTradesChange]
  );

  // Group trades by sector
  const tradeBySector: Record<string, Trade[]> = {};
  for (const trade of trades) {
    if (!tradeBySector[trade.sectorName]) tradeBySector[trade.sectorName] = [];
    tradeBySector[trade.sectorName].push(trade);
  }

  // Use sector order from portfolio, only include sectors with trades
  const sectorsWithTrades = sectors.filter(
    (s) => tradeBySector[s.name]?.length > 0
  );

  const totalSells = trades
    .filter((t) => t.action === 'sell')
    .reduce((s, t) => s + t.amount, 0);
  const totalBuys = trades
    .filter((t) => t.action === 'buy')
    .reduce((s, t) => s + t.amount, 0);
  let totalEstGain = 0;
  let totalEstGainKnown = false;
  for (const t of trades) {
    const g = estGainForSell(t);
    if (g !== undefined) {
      totalEstGain += g;
      totalEstGainKnown = true;
    }
  }

  if (trades.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-text-muted text-sm">
          No trades needed. Your portfolio is already balanced.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 mb-2 border-b border-border">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          Trade Recommendations
        </span>
        {/* Align with sector row grid: [Shares(120) Price(90) Amount(100) NewValue(100) EstGain(100) Remove(40)] */}
        <div className="hidden sm:grid grid-cols-[120px_90px_100px_100px_100px_40px] gap-2 flex-shrink-0">
          <span></span>
          <div className="text-right">
            <span className="text-xs text-text-muted">Sells</span>
            <p className="text-sm font-mono tabular-nums font-semibold text-loss">
              {formatMoney(totalSells)}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-text-muted">Buys</span>
            <p className="text-sm font-mono tabular-nums font-semibold text-gain">
              {formatMoney(totalBuys)}
            </p>
          </div>
          <span></span>
          <div className="text-right">
            <span className="text-xs text-text-muted">Est. Gain</span>
            <p
              className={`text-sm font-mono tabular-nums font-semibold ${
                totalEstGainKnown
                  ? totalEstGain >= 0
                    ? 'text-gain'
                    : 'text-loss'
                  : 'text-text-muted'
              }`}
            >
              {totalEstGainKnown ? formatMoney(totalEstGain) : '—'}
            </p>
          </div>
          <span></span>
        </div>
        {/* Mobile */}
        <div className="sm:hidden flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs text-text-muted">Sells</span>
            <p className="text-sm font-mono tabular-nums font-semibold text-loss">
              {formatMoney(totalSells)}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-text-muted">Buys</span>
            <p className="text-sm font-mono tabular-nums font-semibold text-gain">
              {formatMoney(totalBuys)}
            </p>
          </div>
        </div>
      </div>

      <div role="tree" className="space-y-1">
        {sectorsWithTrades.map((sector) => {
          const sectorTrades = tradeBySector[sector.name] || [];
          const isOpen = expanded[sector.name] ?? false;
          const sectorSells = sectorTrades
            .filter((t) => t.action === 'sell')
            .reduce((s, t) => s + t.amount, 0);
          const sectorBuys = sectorTrades
            .filter((t) => t.action === 'buy')
            .reduce((s, t) => s + t.amount, 0);
          let sectorEstGain = 0;
          let sectorEstGainKnown = false;
          for (const t of sectorTrades) {
            const g = estGainForSell(t);
            if (g !== undefined) {
              sectorEstGain += g;
              sectorEstGainKnown = true;
            }
          }
          const tradeCount = sectorTrades.length;

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
                    ({tradeCount} {tradeCount === 1 ? 'trade' : 'trades'})
                  </span>
                </button>
                {/* Desktop: align with grid columns [Shares(120) Price(90) Amount(100) NewValue(100) EstGain(100) Remove(40)] */}
                <div className="hidden sm:grid grid-cols-[120px_90px_100px_100px_100px_40px] gap-2 text-sm font-mono tabular-nums flex-shrink-0">
                  <span></span>
                  {sectorSells > 0 ? (
                    <span className="text-loss text-right">-{formatMoney(sectorSells)}</span>
                  ) : (
                    <span></span>
                  )}
                  {sectorBuys > 0 ? (
                    <span className="text-gain text-right">+{formatMoney(sectorBuys)}</span>
                  ) : (
                    <span></span>
                  )}
                  <span className="text-text text-right font-semibold">
                    {formatMoney(
                      sector.holdings.reduce((sum, h) => {
                        const curVal = holdingValue[h.ticker] ?? 0;
                        const trade = sectorTrades.find((t) => t.ticker === h.ticker);
                        if (!trade) return sum + curVal;
                        return sum + curVal + (trade.action === 'buy' ? trade.amount : -trade.amount);
                      }, 0)
                    )}
                  </span>
                  {sectorEstGainKnown ? (
                    <span
                      className={`text-right font-semibold ${
                        sectorEstGain >= 0 ? 'text-gain' : 'text-loss'
                      }`}
                    >
                      {formatMoney(sectorEstGain)}
                    </span>
                  ) : (
                    <span></span>
                  )}
                  <span></span>
                </div>
                {/* Mobile */}
                <div className="sm:hidden flex items-center gap-2 text-sm font-mono tabular-nums flex-shrink-0">
                  {sectorSells > 0 && (
                    <span className="text-loss">-{formatMoney(sectorSells)}</span>
                  )}
                  {sectorBuys > 0 && (
                    <span className="text-gain">+{formatMoney(sectorBuys)}</span>
                  )}
                </div>
              </div>
              {isOpen && (
                <div className="ml-6 mt-1 mb-2 space-y-px" role="group">
                  {/* Desktop table header */}
                  <div className="hidden sm:grid grid-cols-[minmax(180px,1fr)_120px_90px_100px_100px_100px_40px] gap-2 px-3 py-1.5 text-xs text-text-muted">
                    <span>Ticker</span>
                    <span className="text-right">Shares</span>
                    <span className="text-right">Price</span>
                    <span className="text-right">Amount</span>
                    <span className="text-right">New Value</span>
                    <span className="text-right">Est. Gain</span>
                    <span></span>
                  </div>
                  {sectorTrades.map((trade) => {
                    const estGain = estGainForSell(trade);
                    return (
                    <div
                      key={trade.ticker}
                      className="hidden sm:grid grid-cols-[minmax(180px,1fr)_120px_90px_100px_100px_100px_40px] gap-2 px-3 py-1.5 rounded hover:bg-surface/50 text-sm items-center"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-semibold text-text">
                          {trade.ticker}
                        </span>
                        <span className="text-text-muted text-xs truncate">
                          {trade.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-end gap-2.5">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                            trade.action === 'buy'
                              ? 'bg-gain/10 text-gain'
                              : 'bg-loss/10 text-loss'
                          }`}
                        >
                          {trade.action.toUpperCase()}
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          step="1"
                          value={trade.shares}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            updateShares(trade.ticker, isNaN(v) ? 0 : v);
                          }}
                          className="no-spinner w-16 px-1.5 py-0.5 text-xs font-mono tabular-nums text-right border border-border rounded bg-surface text-text focus:outline-none focus:border-accent"
                          aria-label={`Shares for ${trade.ticker}`}
                        />
                      </div>
                      <span className="text-right font-mono tabular-nums text-text-muted">
                        ${trade.price.toFixed(2)}
                      </span>
                      <span
                        className={`text-right font-mono tabular-nums font-semibold ${
                          trade.action === 'buy' ? 'text-gain' : 'text-loss'
                        }`}
                      >
                        {formatMoney(trade.amount)}
                      </span>
                      <span className="text-right font-mono tabular-nums text-text">
                        {formatMoney(
                          (holdingValue[trade.ticker] ?? 0) +
                            (trade.action === 'buy' ? trade.amount : -trade.amount)
                        )}
                      </span>
                      {estGain !== undefined ? (
                        <span
                          className={`text-right font-mono tabular-nums ${
                            estGain >= 0 ? 'text-gain' : 'text-loss'
                          }`}
                        >
                          {formatMoney(estGain)}
                        </span>
                      ) : (
                        <span className="text-right font-mono tabular-nums text-text-muted">
                          —
                        </span>
                      )}
                      <div className="flex justify-end">
                        <button
                          onClick={() => removeTrade(trade.ticker)}
                          className="p-1 text-text-muted hover:text-loss transition-colors"
                          aria-label={`Remove ${trade.ticker} trade`}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    );
                  })}
                  {/* Mobile card layout */}
                  {sectorTrades.map((trade) => (
                    <div
                      key={`mobile-${trade.ticker}`}
                      className="sm:hidden p-3 rounded-md border border-border bg-surface mb-1"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              trade.action === 'buy'
                                ? 'bg-gain/10 text-gain'
                                : 'bg-loss/10 text-loss'
                            }`}
                          >
                            {trade.action.toUpperCase()}
                          </span>
                          <span className="font-mono font-semibold text-sm text-text">
                            {trade.ticker}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono tabular-nums text-sm font-semibold ${
                              trade.action === 'buy' ? 'text-gain' : 'text-loss'
                            }`}
                          >
                            {formatMoney(trade.amount)}
                          </span>
                          <button
                            onClick={() => removeTrade(trade.ticker)}
                            className="p-1 text-text-muted hover:text-loss transition-colors"
                            aria-label={`Remove ${trade.ticker} trade`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-text-muted truncate mb-1.5">
                        {trade.name}
                      </p>
                      <div className="flex justify-between items-center text-xs text-text-muted font-mono tabular-nums">
                        <div className="flex items-center gap-1">
                          <span>Shares:</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            step="1"
                            value={trade.shares}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              updateShares(trade.ticker, isNaN(v) ? 0 : v);
                            }}
                            className="no-spinner w-16 px-1.5 py-0.5 text-xs font-mono tabular-nums text-right border border-border rounded bg-bg text-text focus:outline-none focus:border-accent"
                          />
                        </div>
                        <span>@ {formatMoneyExact(trade.price)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs mt-1.5">
                        <span className="text-text-muted italic">{trade.reason}</span>
                        <span className="font-mono tabular-nums text-text">
                          New: {formatMoney(
                            (holdingValue[trade.ticker] ?? 0) +
                              (trade.action === 'buy' ? trade.amount : -trade.amount)
                          )}
                        </span>
                      </div>
                      {trade.action === 'sell' && (
                        <div className="flex justify-end items-center text-xs mt-1">
                          {(() => {
                            const g = estGainForSell(trade);
                            return g !== undefined ? (
                              <span
                                className={`font-mono tabular-nums ${
                                  g >= 0 ? 'text-gain' : 'text-loss'
                                }`}
                              >
                                Est. Gain: {formatMoney(g)}
                              </span>
                            ) : (
                              <span className="font-mono tabular-nums text-text-muted">
                                Est. Gain: —
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
