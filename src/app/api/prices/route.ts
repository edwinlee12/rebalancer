import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

// v3 requires instantiation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = new (YahooFinance as any)();

const TICKER_REGEX = /^[A-Za-z0-9.-]{1,10}$/;
const MAX_TICKERS = 50;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tickers } = body;

    if (!Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json(
        { error: 'tickers must be a non-empty array' },
        { status: 400 }
      );
    }

    if (tickers.length > MAX_TICKERS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_TICKERS} tickers per request` },
        { status: 400 }
      );
    }

    // Validate ticker format
    const invalid = tickers.filter(
      (t: unknown) => typeof t !== 'string' || !TICKER_REGEX.test(t)
    );
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Invalid tickers: ${invalid.join(', ')}` },
        { status: 400 }
      );
    }

    // Fetch quotes from Yahoo Finance in parallel batches
    const results: Record<
      string,
      { price: number; name: string; fetchedAt: number }
    > = {};
    const errors: string[] = [];

    // Yahoo Finance uses bare symbols for mutual funds (FGSIX), but the
    // custodian's report writes them with a dot (FGSI.X). Strip the dot
    // before querying, then store under the original ticker.
    const toYahooSymbol = (t: string) => t.replace(/\.X$/i, 'X');

    const BATCH_SIZE = 10;
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = (tickers as string[]).slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          const quote = await yahooFinance.quote(toYahooSymbol(ticker));
          if (quote && quote.regularMarketPrice) {
            results[ticker.toUpperCase()] = {
              price: quote.regularMarketPrice,
              name:
                quote.longName ||
                quote.shortName ||
                quote.displayName ||
                ticker.toUpperCase(),
              fetchedAt: Date.now(),
            };
          } else {
            errors.push(ticker);
          }
        })
      );
      for (let j = 0; j < settled.length; j++) {
        if (settled[j].status === 'rejected') {
          errors.push(batch[j]);
        }
      }
    }

    return NextResponse.json({
      prices: results,
      errors: [...new Set(errors)],
      fetchedAt: Date.now(),
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch prices' },
      { status: 500 }
    );
  }
}
