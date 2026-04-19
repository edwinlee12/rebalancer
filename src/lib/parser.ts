import * as XLSX from 'xlsx';
import type { Portfolio, Sector, Holding } from './types';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const SECTION_HEADERS = [
  'COMMON STOCK and SECTOR SPECIFIC ETFs',
  'MUTUAL FUNDS and ETFs - U.S. EQUITIES',
  'MUTUAL FUNDS and ETFs - INTERNATIONAL EQUITIES',
];

const CASH_SECTION = 'CASH';

function isSeparatorRow(row: (string | number | null)[]): boolean {
  return row.some(
    (cell) => typeof cell === 'string' && /^-{3,}/.test(cell.trim())
  );
}

function isTotalRow(row: (string | number | null)[]): boolean {
  const first = row[0];
  return typeof first === 'string' && first.startsWith('TOTAL');
}

function isSummaryLine(row: (string | number | null)[]): boolean {
  // Subtotal rows: col A is null, col E has a number (total cost), col G has a number (market value)
  // Also catches separator rows with "---" in col E
  if (row[0] !== null && row[0] !== undefined) return false;
  const colE = row[4];
  if (typeof colE === 'string' && /^-{3,}/.test(colE.trim())) return true;
  if (typeof colE === 'number' && typeof row[6] === 'number' && row[9] === null) return true;
  return false;
}

function isBlankRow(row: (string | number | null)[]): boolean {
  return row.every((cell) => cell === null || cell === undefined);
}

export function parsePortfolioAppraisal(buffer: ArrayBuffer): Portfolio {
  if (buffer.byteLength > MAX_FILE_SIZE) {
    throw new Error('File exceeds 5MB limit. Try exporting just your holdings.');
  }

  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
  });

  // Dynamic header detection: find row where col A = "Quantity" and col B = "Security"
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (
      typeof row[0] === 'string' &&
      row[0].trim() === 'Quantity' &&
      typeof row[1] === 'string' &&
      row[1].trim() === 'Security'
    ) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error(
      "Couldn't find header row. Make sure this is a Portfolio Appraisal XLSX."
    );
  }

  // Extract account info from rows before header
  let accountName: string | undefined;
  if (rows.length > 3 && typeof rows[2]?.[0] === 'string') {
    accountName = rows[2][0].trim();
  }

  // Find separator row after header
  let dataStartIndex = headerRowIndex + 1;
  for (let i = headerRowIndex + 1; i < Math.min(rows.length, headerRowIndex + 5); i++) {
    if (isSeparatorRow(rows[i])) {
      dataStartIndex = i + 1;
      break;
    }
  }

  const sectors: Sector[] = [];
  let cashValue = 0;
  let currentSector: string | null = null;
  let currentHoldings: Holding[] = [];
  let inCashSection = false;
  let inDataSection = false;

  for (let i = dataStartIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row || isBlankRow(row)) {
      continue;
    }

    if (isTotalRow(row)) break;

    const firstCell = row[0];
    const firstStr = typeof firstCell === 'string' ? firstCell.trim() : '';

    // Check for section headers
    if (SECTION_HEADERS.includes(firstStr)) {
      inDataSection = true;
      inCashSection = false;
      continue;
    }

    // Check for CASH section
    if (firstStr === CASH_SECTION) {
      inCashSection = true;
      continue;
    }

    // Skip separator rows
    if (isSeparatorRow(row)) continue;

    // Skip summary/subtotal rows
    if (isSummaryLine(row)) continue;

    // Handle cash holdings
    if (inCashSection) {
      const value = row[6];
      if (typeof value === 'number') {
        cashValue += value;
      } else if (typeof row[4] === 'number' && row[9] === null) {
        // Subtotal row in cash section
        cashValue = row[4] as number;
      }
      continue;
    }

    // Check if this is a sector header: col A has text, rest are null
    const restNull = row.slice(1).every((c) => c === null || c === undefined);
    if (typeof firstCell === 'string' && restNull && !isSeparatorRow(row)) {
      // Save previous sector
      if (currentSector && currentHoldings.length > 0) {
        const totalValue = currentHoldings.reduce((s, h) => s + h.value, 0);
        sectors.push({
          name: currentSector,
          holdings: currentHoldings,
          totalValue,
          pct: 0, // will recalculate
        });
      }
      currentSector = firstStr;
      currentHoldings = [];
      continue;
    }

    // Parse holding row: qty (A), name (B), price (F), value (G), pct (H), gain/loss (I), symbol (J)
    if (currentSector && typeof row[9] === 'string' && row[9] !== null) {
      const qty = typeof firstCell === 'number' ? firstCell : 0;
      const name = typeof row[1] === 'string' ? row[1].trim() : '';
      const price = typeof row[5] === 'number' ? row[5] : 0;
      const value = typeof row[6] === 'number' ? row[6] : 0;
      const pct = typeof row[7] === 'number' ? row[7] : 0;
      const gainLoss = typeof row[8] === 'number' ? row[8] : undefined;
      const ticker = row[9].trim().toUpperCase();

      if (ticker && name) {
        currentHoldings.push({ ticker, name, shares: qty, price, value, pct, gainLoss });
      }
    }
  }

  // Save last sector
  if (currentSector && currentHoldings.length > 0) {
    const totalValue = currentHoldings.reduce((s, h) => s + h.value, 0);
    sectors.push({
      name: currentSector,
      holdings: currentHoldings,
      totalValue,
      pct: 0,
    });
  }

  // Calculate total portfolio value (excluding cash)
  const totalValue = sectors.reduce((s, sec) => s + sec.totalValue, 0) + cashValue;

  // Recalculate sector percentages
  for (const sector of sectors) {
    sector.pct = totalValue > 0 ? (sector.totalValue / totalValue) * 100 : 0;
  }

  return {
    sectors,
    totalValue,
    cashValue,
    accountName,
  };
}
