import { z } from "zod";

/** Spreadsheets (.xlsx) the club can import. */
export const IMPORT_KINDS = ["players", "teams"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;
export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const importParamSchema = z.object({ kind: z.enum(IMPORT_KINDS) });

/** What happens (preview) or happened (applied) to one spreadsheet row. */
export const IMPORT_ROW_STATUSES = ["create", "update", "unchanged", "error"] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export interface ImportRowResult {
  /** Spreadsheet row number (the header is row 1); 0 for problems with the whole file. */
  line: number;
  status: ImportRowStatus;
  /** Name or alias of the player / team, for display. Null on file-level problems. */
  label: string | null;
  /** Identity code of the player (after an apply, also for newly created ones). */
  identityCode: string | null;
  /** Machine-readable reason for an error, e.g. "unknown_team". */
  error: string | null;
}

export interface ImportReport {
  kind: ImportKind;
  /** False for a preview: nothing was written. */
  applied: boolean;
  counts: Record<ImportRowStatus, number>;
  rows: ImportRowResult[];
}

/** Column headers of each template, in order (Portuguese, the club's language). */
export const IMPORT_TEMPLATE_HEADERS = {
  players: [
    "Código",
    "Nome",
    "Alias",
    "Sexo",
    "Data de nascimento",
    "Nº federação",
    "Posição",
    "Pé preferencial",
    "Equipa",
    "Nº camisola",
  ],
  teams: ["Nome", "Escalão", "Categoria", "Organização"],
} as const satisfies Record<ImportKind, readonly string[]>;
