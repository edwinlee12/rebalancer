# TODOS

## V1 — Build alongside implementation

### Initial git commit + Vercel deploy
**What:** Commit the entire codebase and deploy to Vercel.
**Why:** No git commits exist yet. Can't ship, can't share, can't track changes.
**Context:** Project is build-clean and all 37 tests pass. Ready to commit.
**Depends on:** Nothing.

### Full design system (DESIGN.md)
**What:** Run /design-consultation to produce a complete DESIGN.md with button styles, input field styles, dark mode color mapping, spacing system, component vocabulary, and motion guidelines.
**Why:** The typography scale and chart palette in CLAUDE.md are enough to start building, but when the engineer hits "what should this button look like?" or "how do inputs look in dark mode?", they'll have to guess.
**Context:** Added during /plan-design-review. Current design system covers colors, typography, chart palette, interaction states, responsive breakpoints, and accessibility. Missing: button/input component specs, full dark mode token mapping, motion guidelines.
**Depends on:** Nothing. Can run anytime before or during polish phase.

### Polygon.io price fallback
**What:** Add Polygon.io as a fallback when Yahoo Finance is down or rate-limited. Previous-day close prices via their free tier.
**Why:** Design doc specifies this. Currently if Yahoo fails, the app falls back to stale report prices (potentially months old). Polygon.io provides previous-day close, which is much better than report prices for volatile tickers.
**Context:** yahoo-finance2 is a scraping wrapper; Yahoo can break it without notice. Polygon.io free tier gives previous-day close only. Requires a free API key.
**Depends on:** Batch price fetch (Issue 1 from eng review).

## V2 — Deferred

### Per-ticker weight overrides within sectors
**What:** Currently sector targets default to equal-weight distribution. V1 adds the ability to override individual ticker weights within a sector. V2 could add more sophisticated intra-sector allocation strategies (e.g., market-cap weighted, custom ratios with memory).
**Context:** V1 already supports overrides. V2 enhancement would be smarter defaults and remembered preferences.

### Multi-account awareness
**What:** Support uploading reports from multiple accounts and seeing a consolidated portfolio view with cross-account rebalancing recommendations.
**Why:** Many RIA clients have multiple accounts (IRA, taxable, trust). Rebalancing across accounts is where the real value is.
**Context:** Flagged in the original /office-hours design doc as the long-term product direction. Requires thinking about tax-advantaged vs taxable account placement.

### Tax-loss harvesting
**What:** When recommending sells, prefer positions with losses (tax-loss harvesting) and flag positions with large unrealized gains (the gain/loss data is already in column I of the XLSX).
**Why:** Tax efficiency is a major differentiator for sophisticated investors.
**Context:** The data is already parsed (gain/loss in col I). The algorithm just doesn't use it yet.

### PDF report support
**What:** Parse PDF versions of the Portfolio Appraisal report.
**Why:** Some users may receive PDF statements instead of XLSX exports.
**Context:** Rejected from V1 scope in /office-hours as "PDF is a rabbit hole." Revisit when there's user demand.
