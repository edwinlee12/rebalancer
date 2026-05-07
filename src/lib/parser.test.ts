import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { parsePortfolioAppraisal } from './parser';

function loadReport(name: string): ArrayBuffer {
  const buf = readFileSync(`report-samples/${name}`);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('parser', () => {
  describe('Report 1', () => {
    const portfolio = parsePortfolioAppraisal(loadReport('Report 1.xlsx'));

    test('extracts correct number of sectors', () => {
      // Consumer Discretionary, Consumer Staples, Financials, Health Care,
      // Industrials, Info Tech, Communication Services, Utilities,
      // Small Cap Blend, Mid Cap Blend, International Blend
      expect(portfolio.sectors.length).toBe(11);
    });

    test('extracts correct sector names', () => {
      const names = portfolio.sectors.map((s) => s.name);
      expect(names).toContain('Consumer Discretionary');
      expect(names).toContain('Information Technology');
      expect(names).toContain('Small Cap Blend');
      expect(names).toContain('Mid Cap Blend');
      expect(names).toContain('International Blend');
    });

    test('extracts holdings per sector', () => {
      const infoTech = portfolio.sectors.find(
        (s) => s.name === 'Information Technology'
      );
      expect(infoTech).toBeDefined();
      expect(infoTech!.holdings.length).toBe(8);
    });

    test('extracts ticker symbols uppercase', () => {
      const holdings = portfolio.sectors.flatMap((s) => s.holdings);
      const tickers = holdings.map((h) => h.ticker);
      expect(tickers).toContain('AMZN');
      expect(tickers).toContain('NVDA');
      expect(tickers).toContain('GOOG');
    });

    test('extracts share counts including fractional', () => {
      const fgsi = portfolio.sectors
        .flatMap((s) => s.holdings)
        .find((h) => h.ticker === 'FGSI.X');
      expect(fgsi).toBeDefined();
      expect(fgsi!.shares).toBeCloseTo(448.766, 3);
    });

    test('extracts prices', () => {
      const amzn = portfolio.sectors
        .flatMap((s) => s.holdings)
        .find((h) => h.ticker === 'AMZN');
      expect(amzn).toBeDefined();
      expect(amzn!.price).toBe(218.15);
    });

    test('extracts market values', () => {
      const amzn = portfolio.sectors
        .flatMap((s) => s.holdings)
        .find((h) => h.ticker === 'AMZN');
      expect(amzn!.value).toBe(9598.6);
    });

    test('filters out cash section', () => {
      const allTickers = portfolio.sectors.flatMap((s) =>
        s.holdings.map((h) => h.ticker)
      );
      expect(allTickers).not.toContain('DGCSXX');
    });

    test('captures cash value', () => {
      expect(portfolio.cashValue).toBeCloseTo(1005.1, 1);
    });

    test('calculates total portfolio value', () => {
      expect(portfolio.totalValue).toBeGreaterThan(400000);
    });

    test('total ticker count is 32', () => {
      const count = portfolio.sectors.reduce(
        (s, sec) => s + sec.holdings.length,
        0
      );
      expect(count).toBe(32);
    });

    test('extracts gain/loss data', () => {
      const amzn = portfolio.sectors
        .flatMap((s) => s.holdings)
        .find((h) => h.ticker === 'AMZN');
      expect(amzn!.gainLoss).toBe(1666.28);
    });

    test('handles mutual fund tickers with dots', () => {
      const allTickers = portfolio.sectors.flatMap((s) =>
        s.holdings.map((h) => h.ticker)
      );
      expect(allTickers).toContain('FGSI.X');
    });
  });

  describe('Report 4 (dynamic header detection)', () => {
    const portfolio = parsePortfolioAppraisal(loadReport('Report 4.xlsx'));

    test('detects header at row 9', () => {
      // Report 4 has header row at index 8 (row 9) instead of index 7
      expect(portfolio.sectors.length).toBeGreaterThan(0);
    });

    test('extracts holdings correctly', () => {
      const count = portfolio.sectors.reduce(
        (s, sec) => s + sec.holdings.length,
        0
      );
      expect(count).toBe(29);
    });
  });

  test('rejects oversized files', () => {
    const bigBuffer = new ArrayBuffer(6 * 1024 * 1024);
    expect(() => parsePortfolioAppraisal(bigBuffer)).toThrow('5MB');
  });

  test('rejects invalid XLSX format', () => {
    const buf = new TextEncoder().encode('not a real xlsx');
    expect(() =>
      parsePortfolioAppraisal(buf.buffer as ArrayBuffer)
    ).toThrow();
  });

  describe('Report 3 (negative cash)', () => {
    const portfolio = parsePortfolioAppraisal(loadReport('Report 3.xlsx'));

    test('captures net cash (includes negative cash + money market)', () => {
      // Report 3 has -$2,191.55 cash + $2,341.68 money market = $150.13 net
      expect(portfolio.cashValue).toBeCloseTo(150.13, 0);
    });

    test('extracts sectors', () => {
      expect(portfolio.sectors.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    test('throws on file exceeding 5MB', () => {
      // Create a buffer larger than 5MB
      const bigBuffer = new ArrayBuffer(6 * 1024 * 1024);
      expect(() => parsePortfolioAppraisal(bigBuffer)).toThrow('5MB');
    });

    test('throws on file with no header row', () => {
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['Name', 'Value'],
        ['Test', 100],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const ab = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      expect(() => parsePortfolioAppraisal(ab)).toThrow('header row');
    });

    test('returns empty portfolio for file with header but no data', () => {
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['Quantity', 'Security', 'Cost', 'Cost', 'Total Cost', 'Price', 'Market Value', 'Pct', 'Gain/Loss', 'Symbol'],
        ['---', '---', '---', '---', '---', '---', '---', '---', '---', '---'],
        ['TOTAL', null, null, null, null, null, 0],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const ab = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      const portfolio = parsePortfolioAppraisal(ab);
      expect(portfolio.sectors.length).toBe(0);
      expect(portfolio.totalValue).toBe(0);
    });
  });
});
