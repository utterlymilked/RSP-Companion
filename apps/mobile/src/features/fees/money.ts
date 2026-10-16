/** Euro amounts for display: `1234` cents → `12,34 €`. */
export function formatEuros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

/** Cents from text typed by a person (`12,5` or `12.50`); null when it is not an amount. */
export function parseEuros(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) && value >= 0
    ? Math.round(value * 100)
    : null;
}
