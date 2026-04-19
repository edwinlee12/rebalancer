import { useState, useCallback, useRef, useMemo } from 'react';
import type {
  Portfolio,
  SectorTarget,
  RebalanceMode,
  RebalanceResult,
  Trade,
  PriceData,
  AddedTicker,
  Holding,
} from './types';
import { rebalance } from './rebalance';

export type WizardStep = 'targets' | 'recommendations' | 'trades';

const PRICE_TTL = 15 * 60 * 1000; // 15 minutes
const STORAGE_KEY = 'rebalancer-targets';

interface StoredState {
  targets: SectorTarget[];
  addedTickers?: AddedTicker[];
}

function loadSavedState(): StoredState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    // Backward compat: old format was a bare SectorTarget[] array
    if (Array.isArray(parsed)) return { targets: parsed };
    return parsed as StoredState;
  } catch {
    return null;
  }
}

function saveState(state: StoredState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function useRebalancerStore() {
  const [step, setStep] = useState<WizardStep>('targets');
  const [parsedPortfolio, setParsedPortfolio] = useState<Portfolio | null>(null);
  const [targets, setTargets] = useState<SectorTarget[]>([]);
  const [addedTickers, setAddedTickers] = useState<AddedTicker[]>([]);
  const [mode, setMode] = useState<RebalanceMode>('buy-sell');
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [result, setResult] = useState<RebalanceResult | null>(null);
  const [editedTrades, setEditedTrades] = useState<Trade[] | null>(null);
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [priceErrors, setPriceErrors] = useState<string[]>([]);
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  const pricesFetchedAt = useRef<number>(0);

  const fetchPrices = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) return prices;
    if (
      Date.now() - pricesFetchedAt.current < PRICE_TTL &&
      tickers.every((t) => prices[t])
    ) {
      return prices;
    }

    setIsFetchingPrices(true);
    try {
      const res = await fetch('/api/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers }),
      });
      const data = await res.json();

      if (data.prices) {
        const newPrices: Record<string, PriceData> = {};
        for (const [ticker, info] of Object.entries(
          data.prices as Record<string, { price: number; fetchedAt: number }>
        )) {
          newPrices[ticker] = {
            ticker,
            price: info.price,
            fetchedAt: info.fetchedAt,
            isLive: true,
          };
        }
        setPrices((prev) => ({ ...prev, ...newPrices }));
        pricesFetchedAt.current = Date.now();
        if (data.errors?.length > 0) {
          setPriceErrors(data.errors);
        }
        return { ...prices, ...newPrices };
      }
    } catch {
      setPriceErrors(tickers);
    } finally {
      setIsFetchingPrices(false);
    }
    return prices;
  }, [prices]);

  const handlePortfolioLoaded = useCallback(
    (p: Portfolio) => {
      setParsedPortfolio(p);
      setResult(null);
      setEditedTrades(null);

      const saved = loadSavedState();
      if (saved && saved.targets.length > 0) {
        const matched = p.sectors.map((sector) => {
          const savedTarget = saved.targets.find(
            (t) => t.sectorName === sector.name
          );
          if (savedTarget) return savedTarget;
          return {
            sectorName: sector.name,
            targetPct: Math.round(sector.pct),
          };
        });
        setTargets(matched);

        // Restore added tickers, but only for sectors that exist in this portfolio
        const validSectorNames = new Set(p.sectors.map((s) => s.name));
        const restoredAdds = (saved.addedTickers ?? []).filter(
          (a) =>
            validSectorNames.has(a.sectorName) &&
            !p.sectors
              .find((s) => s.name === a.sectorName)
              ?.holdings.some((h) => h.ticker === a.ticker)
        );
        setAddedTickers(restoredAdds);
      } else {
        const initial = p.sectors.map((sector) => ({
          sectorName: sector.name,
          targetPct: Math.round(sector.pct),
        }));
        setTargets(initial);
        setAddedTickers([]);
      }
    },
    []
  );

  const handleSaveTargets = useCallback(() => {
    saveState({ targets, addedTickers });
  }, [targets, addedTickers]);

  // Augmented portfolio injects added tickers as zero-share phantom holdings
  // so the rebalancer treats them like any other ticker (and they show in the UI).
  const portfolio = useMemo<Portfolio | null>(() => {
    if (!parsedPortfolio) return null;
    if (addedTickers.length === 0) return parsedPortfolio;

    return {
      ...parsedPortfolio,
      sectors: parsedPortfolio.sectors.map((sector) => {
        const adds = addedTickers.filter((a) => a.sectorName === sector.name);
        if (adds.length === 0) return sector;

        const phantoms: Holding[] = adds.map((a) => ({
          ticker: a.ticker,
          name: a.name,
          shares: 0,
          price: prices[a.ticker]?.price ?? 0,
          value: 0,
          pct: 0,
          isAdded: true,
        }));

        return { ...sector, holdings: [...sector.holdings, ...phantoms] };
      }),
    };
  }, [parsedPortfolio, addedTickers, prices]);

  const addTicker = useCallback(
    async (
      sectorName: string,
      rawTicker: string
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const ticker = rawTicker.trim().toUpperCase();
      if (!ticker) return { ok: false, error: 'Ticker is required' };
      if (!/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
        return { ok: false, error: 'Invalid ticker format' };
      }

      const sector = parsedPortfolio?.sectors.find((s) => s.name === sectorName);
      const inSector = sector?.holdings.some((h) => h.ticker === ticker);
      const inAdded = addedTickers.some(
        (a) => a.sectorName === sectorName && a.ticker === ticker
      );
      if (inSector || inAdded) {
        return { ok: false, error: `${ticker} is already in this sector` };
      }

      setIsFetchingPrices(true);
      try {
        const res = await fetch('/api/prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tickers: [ticker] }),
        });
        const data = await res.json();
        const info = data.prices?.[ticker];
        if (!info) {
          return { ok: false, error: `Could not fetch price for ${ticker}` };
        }

        setPrices((prev) => ({
          ...prev,
          [ticker]: {
            ticker,
            price: info.price,
            fetchedAt: info.fetchedAt,
            isLive: true,
          },
        }));
        setAddedTickers((prev) => [
          ...prev,
          { ticker, name: info.name || ticker, sectorName },
        ]);
        // Reset weights for that sector to apply equal weight across all holdings
        setTargets((prev) =>
          prev.map((t) =>
            t.sectorName === sectorName ? { ...t, tickerWeights: undefined } : t
          )
        );
        return { ok: true };
      } catch {
        return { ok: false, error: 'Failed to fetch price' };
      } finally {
        setIsFetchingPrices(false);
      }
    },
    [parsedPortfolio, addedTickers]
  );

  const removeAddedTicker = useCallback(
    (sectorName: string, ticker: string) => {
      setAddedTickers((prev) =>
        prev.filter(
          (a) => !(a.sectorName === sectorName && a.ticker === ticker)
        )
      );
      setTargets((prev) =>
        prev.map((t) =>
          t.sectorName === sectorName ? { ...t, tickerWeights: undefined } : t
        )
      );
    },
    []
  );

  const computeRebalance = useCallback(() => {
    if (!portfolio) return;

    const priceMap: Record<string, number> = {};
    for (const sector of portfolio.sectors) {
      for (const holding of sector.holdings) {
        const live = prices[holding.ticker];
        priceMap[holding.ticker] = live?.price ?? holding.price;
      }
    }

    const r = rebalance(portfolio, targets, mode, priceMap, cashAmount);
    setResult(r);
    setEditedTrades(null);
  }, [portfolio, targets, mode, prices, cashAmount]);

  const targetSum = targets.reduce((s, t) => s + t.targetPct, 0);
  const targetsValid = Math.abs(targetSum - 100) <= 0.1;

  return {
    step,
    setStep,
    portfolio,
    setPortfolio: setParsedPortfolio,
    targets,
    setTargets,
    addedTickers,
    addTicker,
    removeAddedTicker,
    mode,
    setMode,
    cashAmount,
    setCashAmount,
    result,
    editedTrades,
    setEditedTrades,
    prices,
    priceErrors,
    setPriceErrors,
    isFetchingPrices,
    fetchPrices,
    handlePortfolioLoaded,
    handleSaveTargets,
    computeRebalance,
    targetSum,
    targetsValid,
  };
}
