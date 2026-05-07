'use client';

import { useEffect, useCallback } from 'react';
import { useRebalancerStore } from '@/lib/store';
import { StepIndicator } from '@/components/StepIndicator';
import { FileUpload } from '@/components/FileUpload';
import { SectorTree } from '@/components/SectorTree';
import { TradeCards } from '@/components/TradeCards';
import { TradeList } from '@/components/TradeList';
import type { Portfolio, Trade } from '@/lib/types';

export default function Home() {
  const store = useRebalancerStore();

  // Auto-compute when targets are valid
  useEffect(() => {
    if (store.portfolio && store.targetsValid) {
      store.computeRebalance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.targets, store.mode, store.cashAmount, store.targetsValid, store.prices, store.addedTickers]);

  // Fetch prices for any added tickers that don't have a cached price yet
  // (e.g., tickers restored from localStorage after re-uploading a report)
  useEffect(() => {
    if (!store.portfolio) return;
    const missing = store.addedTickers
      .map((a) => a.ticker)
      .filter((t) => !store.prices[t]);
    if (missing.length > 0) {
      store.fetchPrices(missing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.addedTickers, store.portfolio]);

  // Fetch prices on portfolio load
  const handlePortfolioLoaded = useCallback(
    async (p: Portfolio) => {
      store.handlePortfolioLoaded(p);
      // Always land on the Targets screen after a fresh upload, even if the
      // URL still has #recommendations or #trades from a prior session.
      store.setStep('targets');
      window.history.replaceState(null, '', '#targets');
      const tickers = p.sectors.flatMap((s) =>
        s.holdings.map((h) => h.ticker)
      );
      await store.fetchPrices(tickers);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.handlePortfolioLoaded, store.fetchPrices, store.setStep]
  );

  // Handle browser back
  useEffect(() => {
    const stepFromHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'recommendations' || hash === 'trades') {
        return hash;
      }
      return 'targets';
    };

    const handlePopState = () => {
      store.setStep(stepFromHash());
    };

    window.addEventListener('popstate', handlePopState);

    // Set initial hash
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#targets');
    } else {
      store.setStep(stepFromHash());
    }

    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateTo = useCallback(
    (step: 'targets' | 'recommendations' | 'trades') => {
      store.setStep(step);
      window.history.pushState(null, '', `#${step}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleEditedTradesChange = useCallback(
    (trades: Trade[]) => {
      store.setEditedTrades(trades);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Landing state: no portfolio loaded
  if (!store.portfolio) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 sm:py-20">
        <div className="text-center mb-8">
          <h1 className="font-display font-bold text-2xl text-text mb-2">
            Rebalancer
          </h1>
          <p className="text-text-muted text-sm">Upload. Target. Trade.</p>
        </div>
        <div className="mb-8 flex justify-center">
          <StepIndicator current="targets" />
        </div>
        <FileUpload onPortfolioLoaded={handlePortfolioLoaded} />
      </div>
    );
  }

  const displayTrades = store.editedTrades ?? store.result?.trades ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-6 flex justify-center">
        <StepIndicator current={store.step} onStepClick={navigateTo} />
      </div>

      {/* Screen 1: Portfolio & Targets */}
      {store.step === 'targets' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-2xl text-text">
              Portfolio & Targets
            </h2>
          </div>

          {/* Re-upload */}
          <FileUpload onPortfolioLoaded={handlePortfolioLoaded} />

          {/* Portfolio summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-md border border-border bg-surface">
              <p className="text-xs text-text-muted">Portfolio Value</p>
              <p className="font-mono tabular-nums text-lg font-bold text-text">
                ${store.portfolio.totalValue.toLocaleString('en-US', { minimumFractionDigits: 0 })}
              </p>
            </div>
            <div className="p-3 rounded-md border border-border bg-surface">
              <p className="text-xs text-text-muted">Cash</p>
              <p className="font-mono tabular-nums text-lg font-bold text-text">
                ${store.portfolio.cashValue.toLocaleString('en-US', { minimumFractionDigits: 0 })}
              </p>
            </div>
          </div>

          {/* Price fetch indicator */}
          {store.isFetchingPrices && (
            <div className="flex items-center gap-2 text-sm text-live-blue">
              <div className="w-3 h-3 border-2 border-live-blue border-t-transparent rounded-full animate-spin" />
              Fetching live prices...
            </div>
          )}

          {/* Price errors */}
          {store.priceErrors.length > 0 && (
            <div className="p-3 rounded-md border border-border bg-surface text-sm">
              <p className="text-text-muted mb-1">
                Could not fetch prices for:{' '}
                <span className="font-mono text-loss">
                  {store.priceErrors.join(', ')}
                </span>
              </p>
              <p className="text-xs text-text-muted">
                Using report prices as fallback.
              </p>
            </div>
          )}

          {/* Mode toggle */}
          <div className="flex flex-col sm:flex-row gap-3 p-3 rounded-md border border-border bg-surface">
            <div className="flex gap-2">
              <button
                onClick={() => store.setMode('buy-sell')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  store.mode === 'buy-sell'
                    ? 'bg-accent text-white'
                    : 'border border-border text-text hover:bg-bg'
                }`}
              >
                Buy & Sell
              </button>
              <button
                onClick={() => store.setMode('add-cash')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  store.mode === 'add-cash'
                    ? 'bg-accent text-white'
                    : 'border border-border text-text hover:bg-bg'
                }`}
              >
                Add Cash Only
              </button>
            </div>
            {store.mode === 'add-cash' && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-text-muted">Cash to add:</label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-text-muted">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="100"
                    value={store.cashAmount || ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      store.setCashAmount(isNaN(v) ? 0 : v);
                    }}
                    placeholder="10,000"
                    className="w-32 px-2 py-1.5 text-sm font-mono tabular-nums border border-border rounded bg-bg text-text focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sector tree with inline target allocations */}
          <SectorTree
            sectors={store.portfolio.sectors}
            prices={store.prices}
            pricesFetchedAt={Object.values(store.prices)[0]?.fetchedAt}
            targets={store.targets}
            onTargetsChange={store.setTargets}
            targetSum={store.targetSum}
            onAddTicker={store.addTicker}
            onRemoveAddedTicker={store.removeAddedTicker}
          />

          {/* Wizard footer */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <button
              onClick={store.handleSaveTargets}
              className="px-4 py-2 rounded-md border border-border text-sm text-text hover:bg-surface transition-colors"
            >
              Save Targets
            </button>
            <button
              onClick={() => {
                if (store.targetsValid) {
                  store.computeRebalance();
                  navigateTo('recommendations');
                }
              }}
              disabled={!store.targetsValid}
              className={`px-6 py-2.5 rounded-md text-sm font-semibold transition-colors ${
                store.targetsValid
                  ? 'bg-accent text-white hover:bg-accent-hover'
                  : 'bg-border text-text-muted cursor-not-allowed'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Screen 2: Recommendations */}
      {store.step === 'recommendations' && store.result && (
        <div className="space-y-6">
          <h2 className="font-display font-bold text-2xl text-text">
            Recommendations
          </h2>

          {/* Insights */}
          {store.result.insights.length > 0 && (
            <div className="p-4 rounded-md border border-accent/20 bg-accent-light/30">
              <h3 className="font-display font-semibold text-sm text-accent mb-2">
                Insights
              </h3>
              <ul className="space-y-1">
                {store.result.insights.map((insight, i) => (
                  <li key={i} className="text-sm text-text">
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Editable trade cards */}
          <TradeCards
            trades={displayTrades}
            sectors={store.portfolio.sectors}
            prices={store.prices}
            onTradesChange={handleEditedTradesChange}
          />

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <button
              onClick={() => navigateTo('targets')}
              className="px-4 py-2 rounded-md border border-border text-sm text-text hover:bg-surface transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => navigateTo('trades')}
              className="px-6 py-2.5 rounded-md bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors"
            >
              Confirm → Trade List
            </button>
          </div>
        </div>
      )}

      {/* Screen 3: Trade List */}
      {store.step === 'trades' && (
        <div className="space-y-6">
          <h2 className="font-display font-bold text-2xl text-text">
            Trade List
          </h2>

          <TradeList
            trades={displayTrades}
            undeployedCash={store.result?.undeployedCash ?? 0}
          />

          <div className="pt-4 border-t border-border">
            <button
              onClick={() => navigateTo('recommendations')}
              className="px-4 py-2 rounded-md border border-border text-sm text-text hover:bg-surface transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
