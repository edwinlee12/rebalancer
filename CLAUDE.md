# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rebalancer is a portfolio rebalancing web app for RIA (Registered Investment Advisor) clients. Users upload Portfolio Appraisal XLSX reports, set sector-level target allocations, and get trade recommendations. Two modes: **Buy & Sell** (full rebalance, sells fund buys) and **Add Cash Only** (invest new money into underweight positions, no sells).

## Commands

```bash
bun dev              # Start dev server (Turbopack)
bun run build        # Production build (next build)
bun test             # Run all tests (46 tests across 2 files)
bun test src/lib/parser.test.ts    # Run parser tests only
bun test src/lib/rebalance.test.ts # Run rebalance tests only
bun lint             # ESLint
```

## Architecture

### Single-Page Wizard

The app is a single-page app (`src/app/page.tsx`) with a 3-step wizard controlled by URL hash (`#targets`, `#recommendations`, `#trades`). Browser back = wizard back. All state lives in `src/lib/store.ts` via a custom `useRebalancerStore()` hook (React useState, no external state library).

### Data Flow

1. **Upload** — `FileUpload` component reads XLSX → `parser.ts` returns `Portfolio` (sectors, holdings, cash). Stored in store as `parsedPortfolio`.
2. **Augmented portfolio** — `store.portfolio` is `parsedPortfolio` plus zero-share phantom holdings injected from `addedTickers`. Rebalancer and UI see added tickers transparently — they appear as holdings with `shares=0, isAdded=true, gainLoss=undefined`. All consumers read `store.portfolio`, never `parsedPortfolio` directly.
3. **Price fetch** — `store.fetchPrices()` POSTs tickers to `/api/prices` → yahoo-finance2 → prices cached in React state with 15-min TTL. Falls back to report prices on failure. An effect in `page.tsx` also fetches prices for any added tickers restored from localStorage that don't yet have a cached price.
4. **Auto-compute** — When targets sum to 100% (+/- 0.1%), `rebalance()` runs automatically via useEffect. No explicit rebalance button.
5. **Trade editing** — User edits on Screen 2 stored as `editedTrades` in store, overlaying computed results.
6. **Persistence** — localStorage key `rebalancer-targets` stores `{ targets, addedTickers }`. Backward-compatible with the legacy bare-array format (treated as targets-only). Restored added tickers are filtered to sectors that exist in the new portfolio.

### Core Libraries (pure functions, no React)

- **`src/lib/parser.ts`** — Parses Portfolio Appraisal XLSX. Dynamic header detection (scans for "Quantity"/"Security" row). Handles three sections: COMMON STOCK, MUTUAL FUNDS US, MUTUAL FUNDS INTL. Filters CASH section. Column mapping: A=Qty, B=Name, F=Price, G=Value, H=Pct, I=Gain/Loss, J=Symbol.
- **`src/lib/rebalance.ts`** — Pure rebalancing algorithm. Sector-level targets with equal-weight default per ticker. Supports per-ticker weight overrides via `tickerWeights`. All shares rounded to whole numbers (Math.floor). In buy-sell mode, buys are capped by sell proceeds + available cash. Trade ordering: drift magnitude descending, alphabetical tiebreaker.
- **`src/lib/types.ts`** — All shared types: Portfolio, Sector, Holding (with optional `isAdded` flag for phantom holdings), SectorTarget, Trade, RebalanceMode, RebalanceResult, PriceData, AddedTicker.

### API Route

- **`src/app/api/prices/route.ts`** — POST endpoint. Accepts `{ tickers: string[] }`. Max 50 tickers. Validation regex: `/^[A-Za-z0-9.-]{1,10}$/` (dots/hyphens for mutual fund tickers like FGSI.X). Mutual-fund tickers ending in `.X` are normalized to `X` before the Yahoo lookup (custodian writes `FGSI.X`, Yahoo expects `FGSIX`); the response is keyed back to the original ticker. Response per ticker is `{ price, name, fetchedAt }` where `name` falls back through `longName → shortName → displayName → ticker`. Fetches in parallel batches of 10 via `Promise.allSettled`. Uses yahoo-finance2 v3 (requires `new YahooFinance()` instantiation, cast to `any` for types).

### Key Design Rules

- **Sector-level targets**, not per-ticker. User sets % per sector. Default: equal weight within sector. Per-ticker weights are edited inline in the expanded `SectorTree` row (one number input per holding).
- **Targets pre-populate** from current allocations (rounded to nearest integer %).
- **Cash section excluded** from allocation (filtered during parsing).
- **Tickers stored uppercase** throughout the app.
- **Sell orders before buy orders** on Trade List screen.
- **Whole shares only** for all tickers (including mutual funds). shares=0 removes trade.
- **Zero-target sectors** generate sell-all trades in buy-sell mode (targetPct=0 means exit the sector).
- **Buy budget constraint** in buy-sell mode: total buys cannot exceed sell proceeds + portfolio cash.
- **Add Ticker** — Each expanded sector has a footer input. Submit posts to `/api/prices` to validate; if Yahoo returns no price, the add is rejected. On success the ticker becomes a phantom holding (shares=0, `isAdded=true`) and that sector's `tickerWeights` reset to undefined so all holdings (existing + new) revert to equal weight. Added tickers persist with targets in localStorage.
- **Est. Gain column** (Recommendations screen, sells only) — derived per-share cost basis: `costBasis/sh = (holding.value − holding.gainLoss) / holding.shares`. Estimated realized gain on a sell: `(trade.price − costBasis/sh) × trade.shares`. Negative renders red (loss). Holdings without `gainLoss` (added tickers, money-market, etc.) render as em-dash. Aggregated at per-trade, per-sector, and total levels.

### Styling

Tailwind CSS v4 with CSS custom properties in `globals.css`. Dark mode via `data-theme="dark"` on html element (toggled in layout.tsx header). Color tokens: `--bg`, `--surface`, `--text`, `--accent`, `--live-blue`, `--gain`, `--loss`. Mapped to Tailwind via `@theme inline` block. Font: DM Sans via next/font/google.

### XLSX Parser Details

The parser handles a specific Portfolio Appraisal format from an RIA custodian platform. Sample reports in `report-samples/` (Reports 1-4). Key variations across reports:
- Header row position varies (row 8 in Reports 1-3, row 9 in Report 4) — dynamic detection handles this
- Report 3 has negative cash (-$2,191.55 cash + $2,341.68 money market)
- Report 1 has mutual fund with fractional shares (FGSI.X, 448.766 shares)
- Ticker counts: 29-33 across reports

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available skills: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
