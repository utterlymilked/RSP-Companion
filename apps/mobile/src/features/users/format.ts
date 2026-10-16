import { toLisbon } from "@rsc/shared";

const pad = (n: number) => String(n).padStart(2, "0");

/** An instant as a Lisbon calendar date, "16/10/2026". */
export function shortDate(iso: string) {
  const t = toLisbon(new Date(iso));
  return `${pad(t.day)}/${pad(t.month)}/${t.year}`;
}
