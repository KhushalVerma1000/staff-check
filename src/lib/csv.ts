/**
 * One CSV cell. Quotes when needed, and neutralises spreadsheet formula
 * injection: a cell starting with = + - @ (or tab / CR) would otherwise run as
 * a formula when opened in Excel.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && typeof value === 'string') s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(',');
}
