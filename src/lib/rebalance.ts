import type {
  Portfolio,
  SectorTarget,
  RebalanceMode,
  RebalanceResult,
  Trade,
} from './types';

interface TickerState {
  ticker: string;
  name: string;
  sectorName: string;
  shares: number;
  price: number;
  currentValue: number;
  targetValue: number;
  diff: number; // target - current (positive = underweight, negative = overweight)
}

function roundShares(shares: number): number {
  return Math.floor(shares); // whole shares only
}

function buildTickerStates(
  portfolio: Portfolio,
  targets: SectorTarget[],
  prices: Record<string, number>
): TickerState[] {
  const totalValue = portfolio.totalValue;
  const states: TickerState[] = [];

  for (const target of targets) {
    const sector = portfolio.sectors.find((s) => s.name === target.sectorName);
    const holdings = sector?.holdings ?? [];
    const sectorTargetValue = target.targetPct <= 0 ? 0 : (target.targetPct / 100) * totalValue;

    // Determine per-ticker weights
    const tickerWeights = target.tickerWeights;
    const tickers = holdings.map((h) => h.ticker);

    if (tickers.length === 0) continue;

    for (const holding of holdings) {
      const price = prices[holding.ticker] ?? holding.price;
      const currentValue = holding.shares * price;

      let tickerTargetPct: number;
      if (tickerWeights && tickerWeights[holding.ticker] !== undefined) {
        tickerTargetPct = tickerWeights[holding.ticker] / 100;
      } else {
        tickerTargetPct = 1 / tickers.length; // equal weight
      }

      const targetValue = sectorTargetValue * tickerTargetPct;

      states.push({
        ticker: holding.ticker,
        name: holding.name,
        sectorName: target.sectorName,
        shares: holding.shares,
        price,
        currentValue,
        targetValue,
        diff: targetValue - currentValue,
      });
    }
  }

  return states;
}

function generateReason(
  diffPct: number,
  targetPct: number,
  action: 'buy' | 'sell'
): string {
  const absDiff = Math.abs(diffPct).toFixed(1);
  if (action === 'buy') {
    return `${absDiff}% below target`;
  }
  return `${absDiff}% above target`;
}

function generateInsights(
  states: TickerState[],
  totalValue: number,
  mode: RebalanceMode,
  cashAmount?: number
): string[] {
  const insights: string[] = [];

  // Find largest drifts
  const sorted = [...states].sort(
    (a, b) => Math.abs(b.diff) - Math.abs(a.diff)
  );

  for (const s of sorted.slice(0, 3)) {
    const diffPct = (s.diff / totalValue) * 100;
    if (Math.abs(diffPct) >= 3) {
      if (diffPct < 0) {
        insights.push(
          `You're ${Math.abs(diffPct).toFixed(1)}% overweight in ${s.ticker}.`
        );
      } else {
        insights.push(
          `You're ${Math.abs(diffPct).toFixed(1)}% underweight in ${s.ticker}.`
        );
      }
    } else if (Math.abs(diffPct) <= 1) {
      insights.push(`${s.ticker} is close to target.`);
    }
  }

  // Largest drift insight
  if (sorted.length > 0 && sorted[0].diff < 0) {
    const diffPct = Math.abs((sorted[0].diff / totalValue) * 100);
    if (diffPct >= 2) {
      insights.push(
        `Consider trimming ${sorted[0].ticker} first, it's your biggest drift.`
      );
    }
  }

  // Add Cash mode insight
  if (mode === 'add-cash' && cashAmount) {
    const underweight = states.filter((s) => s.diff > 0);
    if (underweight.length > 0) {
      insights.push(
        `Adding $${cashAmount.toLocaleString()} to ${underweight.length} underweight position${underweight.length > 1 ? 's' : ''} brings you closer to target without selling.`
      );
    }
  }

  return insights;
}

export function rebalance(
  portfolio: Portfolio,
  targets: SectorTarget[],
  mode: RebalanceMode,
  prices: Record<string, number>,
  cashAmount?: number
): RebalanceResult {
  const totalValue =
    mode === 'add-cash' && cashAmount
      ? portfolio.totalValue + cashAmount
      : portfolio.totalValue;

  // Build target portfolio using totalValue (which includes new cash in add-cash mode)
  const portfolioForTargets = { ...portfolio, totalValue };
  const states = buildTickerStates(portfolioForTargets, targets, prices);

  const trades: Trade[] = [];
  let undeployedCash = 0;

  if (mode === 'buy-sell') {
    // Buy & Sell: sells fund buys, buys capped by sells + available cash
    const sellTrades: Trade[] = [];
    const buyTargets: { state: TickerState; roundedShares: number }[] = [];

    for (const state of states) {
      const shareDiff = state.diff / state.price;
      const roundedShares = roundShares(
        Math.abs(shareDiff),
        );

      if (roundedShares <= 0) continue;

      const action: 'buy' | 'sell' = state.diff > 0 ? 'buy' : 'sell';
      const diffPct = (state.diff / totalValue) * 100;
      const targetPct = (state.targetValue / totalValue) * 100;

      if (action === 'sell') {
        sellTrades.push({
          ticker: state.ticker,
          name: state.name,
          action,
          shares: roundedShares,
          price: state.price,
          amount: roundedShares * state.price,
          reason: generateReason(diffPct, targetPct, action),
          sectorName: state.sectorName,
        });
      } else {
        buyTargets.push({ state, roundedShares });
      }
    }

    // Available budget for buys = sell proceeds + existing cash
    const totalSellProceeds = sellTrades.reduce((s, t) => s + t.amount, 0);
    let buyBudget = totalSellProceeds + portfolio.cashValue;

    // Sort buy targets by drift magnitude descending
    buyTargets.sort((a, b) => Math.abs(b.state.diff) - Math.abs(a.state.diff));

    for (const { state, roundedShares } of buyTargets) {
      let sharesToBuy = roundedShares;
      let amount = sharesToBuy * state.price;

      // Cap to remaining budget
      if (amount > buyBudget) {
        sharesToBuy = roundShares(buyBudget / state.price);
        amount = sharesToBuy * state.price;
      }

      if (sharesToBuy <= 0) continue;

      const diffPct = (state.diff / totalValue) * 100;
      const targetPct = (state.targetValue / totalValue) * 100;

      trades.push({
        ticker: state.ticker,
        name: state.name,
        action: 'buy',
        shares: sharesToBuy,
        price: state.price,
        amount,
        reason: generateReason(diffPct, targetPct, 'buy'),
        sectorName: state.sectorName,
      });

      buyBudget -= amount;
    }

    // Add sell trades
    trades.push(...sellTrades);

    // Calculate undeployed cash
    const totalBuys = trades
      .filter((t) => t.action === 'buy')
      .reduce((s, t) => s + t.amount, 0);
    undeployedCash = portfolio.cashValue + totalSellProceeds - totalBuys;
  } else {
    // Add Cash Only: only buys into underweight positions
    if (!cashAmount || cashAmount <= 0) {
      return {
        trades: [],
        insights: ['No cash amount specified for Add Cash mode.'],
        undeployedCash: 0,
      };
    }

    const underweight = states.filter((s) => s.diff > 0);

    if (underweight.length === 0) {
      return {
        trades: [],
        insights: [
          'Your portfolio is already at or above target in all positions. Consider Buy & Sell mode instead.',
        ],
        undeployedCash: cashAmount,
      };
    }

    const totalShortfall = underweight.reduce((s, u) => s + u.diff, 0);
    let remainingCash = cashAmount;

    // Cap each allocation at shortfall if cash exceeds total shortfall
    const excess = cashAmount > totalShortfall ? cashAmount - totalShortfall : 0;

    // Sort by shortfall descending for tiebreaker allocation
    const sorted = [...underweight].sort((a, b) => {
      if (Math.abs(b.diff - a.diff) < 0.01) return a.ticker.localeCompare(b.ticker);
      return b.diff - a.diff;
    });

    const allocations: { state: TickerState; cashAlloc: number }[] = [];

    for (const state of sorted) {
      const proportion = state.diff / totalShortfall;
      const cashAlloc = Math.min(
        proportion * Math.min(cashAmount, totalShortfall),
        state.diff
      );
      allocations.push({ state, cashAlloc });
    }

    // Allocate shares
    for (const { state, cashAlloc } of allocations) {
      const sharesToBuy = roundShares(
        cashAlloc / state.price,
        );

      if (sharesToBuy <= 0) continue;

      const amount = sharesToBuy * state.price;
      remainingCash -= amount;

      const diffPct = (state.diff / totalValue) * 100;
      const targetPct = (state.targetValue / totalValue) * 100;

      trades.push({
        ticker: state.ticker,
        name: state.name,
        action: 'buy',
        shares: sharesToBuy,
        price: state.price,
        amount,
        reason: generateReason(diffPct, targetPct, 'buy'),
        sectorName: state.sectorName,
      });
    }

    // Allocate remaining cash from rounding to largest-shortfall ticker
    if (remainingCash > 0 && sorted.length > 0) {
      const largestShortfall = sorted[0];
      const extraShares = roundShares(
        remainingCash / largestShortfall.price,
        );
      if (extraShares > 0) {
        const existing = trades.find(
          (t) => t.ticker === largestShortfall.ticker
        );
        if (existing) {
          existing.shares += extraShares;
          existing.amount = existing.shares * existing.price;
          remainingCash -= extraShares * largestShortfall.price;
        }
      }
    }

    undeployedCash = remainingCash + excess;
  }

  // Sort trades by drift magnitude descending, tiebreaker alphabetical
  trades.sort((a, b) => {
    const aDrift = Math.abs(
      states.find((s) => s.ticker === a.ticker)?.diff ?? 0
    );
    const bDrift = Math.abs(
      states.find((s) => s.ticker === b.ticker)?.diff ?? 0
    );
    if (Math.abs(bDrift - aDrift) < 0.01) return a.ticker.localeCompare(b.ticker);
    return bDrift - aDrift;
  });

  const insights = generateInsights(states, totalValue, mode, cashAmount);

  return { trades, insights, undeployedCash: Math.max(0, undeployedCash) };
}
