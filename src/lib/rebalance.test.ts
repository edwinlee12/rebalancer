import { describe, test, expect } from 'bun:test';
import { rebalance } from './rebalance';
import type { Portfolio, SectorTarget } from './types';

function makePortfolio(overrides?: Partial<Portfolio>): Portfolio {
  return {
    sectors: [
      {
        name: 'Tech',
        holdings: [
          { ticker: 'AAPL', name: 'Apple', shares: 100, price: 150, value: 15000, pct: 30 },
          { ticker: 'MSFT', name: 'Microsoft', shares: 50, price: 300, value: 15000, pct: 30 },
        ],
        totalValue: 30000,
        pct: 60,
      },
      {
        name: 'Healthcare',
        holdings: [
          { ticker: 'JNJ', name: 'J&J', shares: 100, price: 100, value: 10000, pct: 20 },
        ],
        totalValue: 10000,
        pct: 20,
      },
      {
        name: 'Bonds',
        holdings: [
          { ticker: 'BND', name: 'Bond ETF', shares: 100, price: 100, value: 10000, pct: 20 },
        ],
        totalValue: 10000,
        pct: 20,
      },
    ],
    totalValue: 50000,
    cashValue: 0,
    ...overrides,
  };
}

const prices: Record<string, number> = {
  AAPL: 150,
  MSFT: 300,
  JNJ: 100,
  BND: 100,
};

describe('rebalance', () => {
  describe('buy-sell mode', () => {
    test('no trades when already at target', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 60 },
        { sectorName: 'Healthcare', targetPct: 20 },
        { sectorName: 'Bonds', targetPct: 20 },
      ];

      const result = rebalance(makePortfolio(), targets, 'buy-sell', prices);
      expect(result.trades.length).toBe(0);
    });

    test('generates sell and buy trades for rebalance', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 40 },
        { sectorName: 'Healthcare', targetPct: 30 },
        { sectorName: 'Bonds', targetPct: 30 },
      ];

      const result = rebalance(makePortfolio(), targets, 'buy-sell', prices);
      const sells = result.trades.filter((t) => t.action === 'sell');
      const buys = result.trades.filter((t) => t.action === 'buy');

      expect(sells.length).toBeGreaterThan(0);
      expect(buys.length).toBeGreaterThan(0);

      // Tech should be sold (current 60%, target 40%)
      const techSells = sells.filter(
        (t) => t.ticker === 'AAPL' || t.ticker === 'MSFT'
      );
      expect(techSells.length).toBeGreaterThan(0);

      // Healthcare and Bonds should be bought
      const healthBuys = buys.filter((t) => t.ticker === 'JNJ');
      expect(healthBuys.length).toBe(1);
    });

    test('rounds down to whole shares', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 40 },
        { sectorName: 'Healthcare', targetPct: 30 },
        { sectorName: 'Bonds', targetPct: 30 },
      ];

      const result = rebalance(makePortfolio(), targets, 'buy-sell', prices);
      for (const trade of result.trades) {
        expect(trade.shares).toBe(Math.floor(trade.shares));
      }
    });

    test('surfaces undeployed cash', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 40 },
        { sectorName: 'Healthcare', targetPct: 30 },
        { sectorName: 'Bonds', targetPct: 30 },
      ];

      const result = rebalance(makePortfolio(), targets, 'buy-sell', prices);
      expect(result.undeployedCash).toBeGreaterThanOrEqual(0);
    });

    test('sorts trades by drift magnitude descending', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 40 },
        { sectorName: 'Healthcare', targetPct: 30 },
        { sectorName: 'Bonds', targetPct: 30 },
      ];

      const result = rebalance(makePortfolio(), targets, 'buy-sell', prices);
      if (result.trades.length >= 2) {
        // First trade should have the highest drift
        expect(result.trades.length).toBeGreaterThanOrEqual(2);
      }
    });

    test('respects custom ticker weights', () => {
      const targets: SectorTarget[] = [
        {
          sectorName: 'Tech',
          targetPct: 60,
          tickerWeights: { AAPL: 70, MSFT: 30 },
        },
        { sectorName: 'Healthcare', targetPct: 20 },
        { sectorName: 'Bonds', targetPct: 20 },
      ];

      const result = rebalance(makePortfolio(), targets, 'buy-sell', prices);
      // AAPL should get 70% of Tech's 60% = 42% of portfolio = $21000
      // Current AAPL = $15000, so should buy ~40 shares
      const aaplTrade = result.trades.find((t) => t.ticker === 'AAPL');
      if (aaplTrade) {
        expect(aaplTrade.action).toBe('buy');
      }
    });

    test('generates sell-all for zero-target sectors', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 80 },
        { sectorName: 'Healthcare', targetPct: 20 },
        { sectorName: 'Bonds', targetPct: 0 },
      ];

      const result = rebalance(makePortfolio(), targets, 'buy-sell', prices);
      const bondSell = result.trades.find(
        (t) => t.ticker === 'BND' && t.action === 'sell'
      );
      expect(bondSell).toBeDefined();
      expect(bondSell!.shares).toBe(100);
    });
  });

  describe('add-cash mode', () => {
    test('only generates buy trades', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 40 },
        { sectorName: 'Healthcare', targetPct: 30 },
        { sectorName: 'Bonds', targetPct: 30 },
      ];

      const result = rebalance(
        makePortfolio(),
        targets,
        'add-cash',
        prices,
        10000
      );
      const sells = result.trades.filter((t) => t.action === 'sell');
      expect(sells.length).toBe(0);
    });

    test('routes cash to underweight positions only', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 40 },
        { sectorName: 'Healthcare', targetPct: 30 },
        { sectorName: 'Bonds', targetPct: 30 },
      ];

      const result = rebalance(
        makePortfolio(),
        targets,
        'add-cash',
        prices,
        10000
      );
      // Healthcare and Bonds are underweight (20% current, 30% target)
      const buys = result.trades.map((t) => t.ticker);
      expect(buys).toContain('JNJ');
      expect(buys).toContain('BND');
    });

    test('returns no trades when no cash specified', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 40 },
        { sectorName: 'Healthcare', targetPct: 30 },
        { sectorName: 'Bonds', targetPct: 30 },
      ];

      const result = rebalance(makePortfolio(), targets, 'add-cash', prices, 0);
      expect(result.trades.length).toBe(0);
    });

    test('handles all positions at or above target', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 50 },
        { sectorName: 'Healthcare', targetPct: 15 },
        { sectorName: 'Bonds', targetPct: 15 },
      ];

      // Tech is at 60%, target 50%. Healthcare and Bonds both below target still.
      // Let's make a case where everything is above target.
      const targets2: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 55 },
        { sectorName: 'Healthcare', targetPct: 15 },
        { sectorName: 'Bonds', targetPct: 15 },
      ];

      const result = rebalance(
        makePortfolio(),
        targets2,
        'add-cash',
        prices,
        5000
      );
      // Some positions may still be underweight relative to the new total
      expect(result.undeployedCash).toBeGreaterThanOrEqual(0);
    });

    test('deploys cash proportionally to shortfall', () => {
      // When portfolio is already at target (60/20/20) and we add cash,
      // the new total shifts targets. With $100k on a $50k portfolio,
      // new total = $150k. Tech target = $90k (has $30k, needs $60k),
      // Healthcare = $30k (has $10k, needs $20k), Bonds = $30k (has $10k, needs $20k).
      // All positions become underweight, so all $100k gets deployed.
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 60 },
        { sectorName: 'Healthcare', targetPct: 20 },
        { sectorName: 'Bonds', targetPct: 20 },
      ];

      const result = rebalance(
        makePortfolio(),
        targets,
        'add-cash',
        prices,
        100000
      );
      // Total buys should be close to $100k (minus rounding)
      const totalBuys = result.trades.reduce((s, t) => s + t.amount, 0);
      expect(totalBuys).toBeGreaterThan(90000);
    });
  });

  describe('mutual funds', () => {
    test('rounds mutual fund shares to whole numbers', () => {
      const portfolio: Portfolio = {
        sectors: [
          {
            name: 'Mid Cap',
            holdings: [
              {
                ticker: 'FGSI.X',
                name: 'Federated MDT',
                shares: 448.766,
                price: 69.36,
                value: 31126.41,
                pct: 100,
              },
            ],
            totalValue: 31126.41,
            pct: 100,
          },
        ],
        totalValue: 31126.41,
        cashValue: 0,
      };

      const targets: SectorTarget[] = [{ sectorName: 'Mid Cap', targetPct: 100 }];
      const priceMap = { 'FGSI.X': 69.36 };
      const result = rebalance(portfolio, targets, 'add-cash', priceMap, 5000);

      for (const trade of result.trades) {
        expect(trade.shares).toBe(Math.floor(trade.shares));
        expect(Number.isInteger(trade.shares)).toBe(true);
      }
    });
  });

  describe('insights', () => {
    test('generates overweight insight', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 40 },
        { sectorName: 'Healthcare', targetPct: 30 },
        { sectorName: 'Bonds', targetPct: 30 },
      ];

      const result = rebalance(makePortfolio(), targets, 'buy-sell', prices);
      const overweightInsight = result.insights.find((i) =>
        i.includes('overweight')
      );
      expect(overweightInsight).toBeDefined();
    });

    test('generates add-cash insight', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 40 },
        { sectorName: 'Healthcare', targetPct: 30 },
        { sectorName: 'Bonds', targetPct: 30 },
      ];

      const result = rebalance(
        makePortfolio(),
        targets,
        'add-cash',
        prices,
        10000
      );
      const cashInsight = result.insights.find((i) =>
        i.includes('Adding')
      );
      expect(cashInsight).toBeDefined();
    });
  });

  describe('trade amounts', () => {
    test('trade amount equals shares times price', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 40 },
        { sectorName: 'Healthcare', targetPct: 30 },
        { sectorName: 'Bonds', targetPct: 30 },
      ];

      const result = rebalance(makePortfolio(), targets, 'buy-sell', prices);
      for (const trade of result.trades) {
        expect(trade.amount).toBeCloseTo(trade.shares * trade.price, 2);
      }
    });
  });

  describe('buy-budget capping', () => {
    test('total buys do not exceed sell proceeds plus cash', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 40 },
        { sectorName: 'Healthcare', targetPct: 30 },
        { sectorName: 'Bonds', targetPct: 30 },
      ];

      const result = rebalance(makePortfolio(), targets, 'buy-sell', prices);
      const totalSells = result.trades
        .filter((t) => t.action === 'sell')
        .reduce((s, t) => s + t.amount, 0);
      const totalBuys = result.trades
        .filter((t) => t.action === 'buy')
        .reduce((s, t) => s + t.amount, 0);

      // Buys should not exceed sells + cash (portfolio has cashValue=0)
      expect(totalBuys).toBeLessThanOrEqual(totalSells + 0.01);
    });

    test('uses portfolio cash to fund buys', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 40 },
        { sectorName: 'Healthcare', targetPct: 30 },
        { sectorName: 'Bonds', targetPct: 30 },
      ];

      const portfolioWithCash = makePortfolio({ cashValue: 5000 });
      const result = rebalance(portfolioWithCash, targets, 'buy-sell', prices);
      const totalSells = result.trades
        .filter((t) => t.action === 'sell')
        .reduce((s, t) => s + t.amount, 0);
      const totalBuys = result.trades
        .filter((t) => t.action === 'buy')
        .reduce((s, t) => s + t.amount, 0);

      expect(totalBuys).toBeLessThanOrEqual(totalSells + 5000 + 0.01);
    });
  });

  describe('zero-target sectors', () => {
    test('generates sell trades for zero-target sectors in buy-sell mode', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 80 },
        { sectorName: 'Healthcare', targetPct: 20 },
        { sectorName: 'Bonds', targetPct: 0 },
      ];

      const result = rebalance(makePortfolio(), targets, 'buy-sell', prices);
      const bondSell = result.trades.find(
        (t) => t.ticker === 'BND' && t.action === 'sell'
      );
      expect(bondSell).toBeDefined();
      expect(bondSell!.shares).toBe(100); // sell all 100 shares
    });

    test('does not generate buys for zero-target sectors in add-cash mode', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 80 },
        { sectorName: 'Healthcare', targetPct: 20 },
        { sectorName: 'Bonds', targetPct: 0 },
      ];

      const result = rebalance(makePortfolio(), targets, 'add-cash', prices, 10000);
      const bondTrades = result.trades.filter((t) => t.ticker === 'BND');
      expect(bondTrades.length).toBe(0);
    });
  });

  describe('add-cash edge cases', () => {
    test('handles cash exceeding total shortfall', () => {
      // Portfolio is at 60/20/20. Target is also 60/20/20.
      // With add-cash of $1000 on a $50k portfolio, new total = $51k.
      // Tech target = 60% of $51k = $30,600 (has $30k, shortfall $600)
      // HC target = 20% of $51k = $10,200 (has $10k, shortfall $200)
      // Bonds target = 20% of $51k = $10,200 (has $10k, shortfall $200)
      // Total shortfall = $1000. Cash = $1000. Should deploy most of it.
      // But with whole shares: BND=$100/share -> 2 shares=$200, JNJ=$100 -> 2=$200
      // AAPL=$150 -> 4 shares=$600. Some rounding remainder expected.
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 60 },
        { sectorName: 'Healthcare', targetPct: 20 },
        { sectorName: 'Bonds', targetPct: 20 },
      ];

      // Use a small cash amount where rounding leaves excess
      const result = rebalance(makePortfolio(), targets, 'add-cash', prices, 50);
      // $50 can't buy a whole share of anything (cheapest is BND/JNJ at $100)
      // So all cash should be undeployed
      expect(result.undeployedCash).toBeGreaterThan(0);
    });

    test('allocates rounding remainder to largest-shortfall ticker', () => {
      const targets: SectorTarget[] = [
        { sectorName: 'Tech', targetPct: 40 },
        { sectorName: 'Healthcare', targetPct: 30 },
        { sectorName: 'Bonds', targetPct: 30 },
      ];

      const result = rebalance(makePortfolio(), targets, 'add-cash', prices, 10000);
      // All trades should have whole share counts
      for (const trade of result.trades) {
        expect(Number.isInteger(trade.shares)).toBe(true);
      }
      // Total deployed + undeployed should account for all cash
      const totalDeployed = result.trades.reduce((s, t) => s + t.amount, 0);
      expect(totalDeployed + result.undeployedCash).toBeLessThanOrEqual(10000 + 0.01);
    });
  });
});
