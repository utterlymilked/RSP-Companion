/** "sub9" → "Sub-9", "senior_a" → "Seniores A"; turma codes stay as they are. */
export const groupLabel = (t: (key: string) => string, code: string) =>
  code.startsWith("sub")
    ? `Sub-${code.slice(3)}`
    : code.startsWith("senior")
      ? t(`incidentGroup.${code}`)
      : code;
