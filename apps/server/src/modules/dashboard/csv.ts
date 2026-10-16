/** Cells starting with these characters are read as formulas by spreadsheets. */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Builds a CSV (comma separated, CRLF, UTF-8 BOM so Excel reads accents) from rows. */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  return `﻿${[header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
}

/** Integer cents as a decimal euro amount, e.g. 1250 -> "12.50". */
export const euros = (cents: number) => (cents / 100).toFixed(2);
