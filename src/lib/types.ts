export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  price: number;
  value: number;
  pct: number;
  gainLoss?: number;
  isAdded?: boolean; // user-added phantom holding (shares=0, no cost basis)
}

export interface AddedTicker {
  ticker: string;
  name: string;
  sectorName: string;
}

export interface Sector {
  name: string;
  holdings: Holding[];
  totalValue: number;
  pct: number;
}

export interface Portfolio {
  sectors: Sector[];
  totalValue: number;
  cashValue: number;
}

export interface SectorTarget {
  sectorName: string;
  targetPct: number; // 0-100
  tickerWeights?: Record<string, number>; // ticker -> pct within sector (0-100), must sum to 100
}

export interface Trade {
  ticker: string;
  name: string;
  action: 'buy' | 'sell';
  shares: number;
  price: number;
  amount: number;
  reason: string;
  sectorName: string;
}

export type RebalanceMode = 'buy-sell' | 'add-cash';

export interface RebalanceResult {
  trades: Trade[];
  insights: string[];
  undeployedCash: number;
}

export interface PriceData {
  ticker: string;
  price: number;
  fetchedAt: number; // timestamp ms
  isLive: boolean;
}
