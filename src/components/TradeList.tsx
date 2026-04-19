'use client';

import { useState, useCallback } from 'react';
import type { Trade } from '@/lib/types';

function formatMoney(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

export function TradeList({
  trades,
  undeployedCash,
}: {
  trades: Trade[];
  undeployedCash: number;
}) {
  const [copied, setCopied] = useState(false);

  const sells = trades.filter((t) => t.action === 'sell');
  const buys = trades.filter((t) => t.action === 'buy');
  const totalSells = sells.reduce((s, t) => s + t.amount, 0);
  const totalBuys = buys.reduce((s, t) => s + t.amount, 0);

  const copyToClipboard = useCallback(async () => {
    const lines: string[] = [];
    if (sells.length > 0) {
      lines.push('SELL ORDERS');
      lines.push('Ticker\tShares\tPrice\tAmount');
      for (const t of sells) {
        lines.push(
          `${t.ticker}\t${t.shares}\t$${t.price.toFixed(2)}\t${formatMoney(t.amount)}`
        );
      }
      lines.push('');
    }
    if (buys.length > 0) {
      lines.push('BUY ORDERS');
      lines.push('Ticker\tShares\tPrice\tAmount');
      for (const t of buys) {
        lines.push(
          `${t.ticker}\t${t.shares}\t$${t.price.toFixed(2)}\t${formatMoney(t.amount)}`
        );
      }
    }
    if (undeployedCash > 0) {
      lines.push('');
      lines.push(`Undeployed Cash: ${formatMoney(undeployedCash)}`);
    }

    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [sells, buys, undeployedCash]);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-md border border-border bg-surface">
          <p className="text-xs text-text-muted mb-1">Total Sells</p>
          <p className="font-mono tabular-nums text-lg font-bold text-loss">
            {formatMoney(totalSells)}
          </p>
        </div>
        <div className="p-4 rounded-md border border-border bg-surface">
          <p className="text-xs text-text-muted mb-1">Total Buys</p>
          <p className="font-mono tabular-nums text-lg font-bold text-gain">
            {formatMoney(totalBuys)}
          </p>
        </div>
        <div className="p-4 rounded-md border border-border bg-surface">
          <p className="text-xs text-text-muted mb-1">Undeployed Cash</p>
          <p className="font-mono tabular-nums text-lg font-bold text-text">
            {formatMoney(undeployedCash)}
          </p>
        </div>
      </div>

      {/* Sell orders */}
      {sells.length > 0 && (
        <div>
          <h3 className="font-display font-semibold text-sm text-loss mb-2">
            Sell Orders ({sells.length})
          </h3>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="text-left px-3 py-2 font-medium text-text-muted">
                    Ticker
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-text-muted hidden sm:table-cell">
                    Name
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-text-muted">
                    Shares
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-text-muted">
                    Price
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-text-muted">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {sells.map((t) => (
                  <tr
                    key={t.ticker}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 font-mono font-semibold text-text">
                      {t.ticker}
                    </td>
                    <td className="px-3 py-2 text-text-muted truncate max-w-[200px] hidden sm:table-cell">
                      {t.name}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-text">
                      {t.shares}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-text">
                      ${t.price.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-loss">
                      {formatMoney(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Buy orders */}
      {buys.length > 0 && (
        <div>
          <h3 className="font-display font-semibold text-sm text-gain mb-2">
            Buy Orders ({buys.length})
          </h3>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="text-left px-3 py-2 font-medium text-text-muted">
                    Ticker
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-text-muted hidden sm:table-cell">
                    Name
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-text-muted">
                    Shares
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-text-muted">
                    Price
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-text-muted">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {buys.map((t) => (
                  <tr
                    key={t.ticker}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 font-mono font-semibold text-text">
                      {t.ticker}
                    </td>
                    <td className="px-3 py-2 text-text-muted truncate max-w-[200px] hidden sm:table-cell">
                      {t.name}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-text">
                      {t.shares}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-text">
                      ${t.price.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-gain">
                      {formatMoney(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No trades state */}
      {trades.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gain text-3xl mb-2">\u2713</div>
          <p className="text-text font-display font-semibold">
            Your portfolio is already balanced
          </p>
        </div>
      )}

      {undeployedCash > 0.01 && (
        <p className="text-xs text-text-muted">
          ~{formatMoney(undeployedCash)} undeployed due to share rounding.
        </p>
      )}

      {/* Copy button */}
      {trades.length > 0 && (
        <button
          onClick={copyToClipboard}
          className="w-full sm:w-auto px-6 py-2.5 rounded-md border border-border bg-surface text-text text-sm font-medium hover:bg-bg transition-colors flex items-center justify-center gap-2"
        >
          {copied ? (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy Trade List
            </>
          )}
        </button>
      )}
    </div>
  );
}
