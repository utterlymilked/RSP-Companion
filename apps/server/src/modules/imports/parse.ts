import type { DominantFoot, PlayerPosition, Sex } from "@rsc/shared";
import { z } from "zod";
import { normalizeHeader, parseDate } from "../people/import.js";

/** Normalised column headers (Portuguese and English) accepted for each field. */
const PLAYER_ALIASES = {
  code: ["codigo", "codigo rsc", "identidade", "identity code", "code"],
  fullName: ["nome", "nome completo", "name", "full name"],
  alias: ["alias", "pseudonimo", "nome desportivo", "nome curto", "display name"],
  sex: ["sexo", "genero", "sex"],
  birthDate: ["data de nascimento", "data nascimento", "nascimento", "birth date"],
  federationId: ["n federacao", "n licenca", "licenca", "federation id"],
  position: ["posicao", "position"],
  foot: ["pe preferencial", "pe", "foot"],
  team: ["equipa", "team"],
  shirt: ["n camisola", "camisola", "numero camisola", "shirt"],
} as const;
const TEAM_ALIASES = {
  name: ["nome", "equipa", "name", "team"],
  ageGroup: ["escalao", "age group"],
  category: ["categoria", "category"],
  organisation: ["organizacao", "organisation", "organization"],
} as const;

export interface RowProblem {
  line: number;
  error: string;
}

export interface PlayerRow {
  line: number;
  code: string | null;
  fullName: string | null;
  alias: string | null;
  sex: Sex | null;
  birthDate: string | null;
  federationId: string | null;
  position: PlayerPosition | null;
  foot: DominantFoot | null;
  team: string | null;
  shirt: number | null;
}

export interface TeamRow {
  line: number;
  name: string;
  ageGroup: string | null;
  category: "female" | "male" | "mixed";
  organisation: string | null;
}

const lookup =
  <T extends string>(map: Record<string, T>) =>
  (raw: string) =>
    map[normalizeHeader(raw)] ?? null;
const sexOf = lookup<Sex>({
  m: "male",
  masculino: "male",
  masc: "male",
  male: "male",
  f: "female",
  feminino: "female",
  fem: "female",
  female: "female",
});
const positionOf = lookup<PlayerPosition>({
  "guarda redes": "goalkeeper",
  gr: "goalkeeper",
  goalkeeper: "goalkeeper",
  defesa: "defender",
  def: "defender",
  defender: "defender",
  medio: "midfielder",
  med: "midfielder",
  midfielder: "midfielder",
  avancado: "forward",
  av: "forward",
  forward: "forward",
});
const footOf = lookup<DominantFoot>({
  esquerdo: "left",
  esq: "left",
  left: "left",
  direito: "right",
  dir: "right",
  right: "right",
  ambos: "both",
  ambidestro: "both",
  both: "both",
});
const categoryOf = lookup<"female" | "male" | "mixed">({
  masculino: "male",
  male: "male",
  feminino: "female",
  female: "female",
  misto: "mixed",
  mixed: "mixed",
});

function columns<K extends string>(header: string[], aliases: Record<K, readonly string[]>) {
  const found = new Map<K, number>();
  header.forEach((h, index) => {
    const name = normalizeHeader(h);
    for (const field of Object.keys(aliases) as K[]) {
      if (aliases[field].includes(name) && !found.has(field)) found.set(field, index);
    }
  });
  return found;
}

const fileProblem = (error: string): { problems: RowProblem[] } => ({
  problems: [{ line: 0, error }],
});

export function parsePlayers(table: string[][], lines: number[]) {
  const [header, ...body] = table;
  const rows: PlayerRow[] = [];
  const problems: RowProblem[] = [];
  if (!header) return { rows, ...fileProblem("empty_file") };
  const col = columns(header, PLAYER_ALIASES);
  if (!col.has("fullName") && !col.has("alias")) {
    return { rows, ...fileProblem("missing_name_column") };
  }
  const seenCodes = new Set<string>();
  body.forEach((cells, i) => {
    const line = lines[i + 1] ?? i + 2;
    const get = (f: keyof typeof PLAYER_ALIASES) => cells[col.get(f) ?? -1]?.trim() || null;
    const fullName = get("fullName");
    const alias = get("alias");
    const code = get("code")?.toUpperCase() ?? null;
    const errors: string[] = [];
    if (!fullName && !alias) errors.push("missing_name");
    const sexRaw = get("sex");
    const sex = sexRaw ? sexOf(sexRaw) : null;
    if (sexRaw && !sex) errors.push("invalid_sex");
    const birthRaw = get("birthDate");
    const birthDate = birthRaw ? parseDate(birthRaw) : null;
    if (birthRaw && !birthDate) errors.push("invalid_birth_date");
    const posRaw = get("position");
    const position = posRaw ? positionOf(posRaw) : null;
    if (posRaw && !position) errors.push("invalid_position");
    const footRaw = get("foot");
    const foot = footRaw ? footOf(footRaw) : null;
    if (footRaw && !foot) errors.push("invalid_foot");
    const shirtRaw = get("shirt");
    const shirt = shirtRaw ? Number(shirtRaw) : null;
    if (shirtRaw && !(Number.isInteger(shirt) && (shirt ?? 0) >= 1 && (shirt ?? 0) <= 99)) {
      errors.push("invalid_shirt_number");
    }
    if (shirt !== null && !get("team")) errors.push("shirt_needs_team");
    if (code) {
      if (
        !z
          .string()
          .regex(/^RSC-[0-9A-F]{8}$/)
          .safeParse(code).success
      )
        errors.push("invalid_code");
      else if (seenCodes.has(code)) errors.push("duplicate_code");
      seenCodes.add(code);
    }
    const first = errors[0];
    if (first) {
      problems.push({ line, error: first });
      return;
    }
    rows.push({
      line,
      code,
      fullName,
      alias,
      sex,
      birthDate,
      federationId: get("federationId"),
      position,
      foot,
      team: get("team"),
      shirt,
    });
  });
  return { rows, problems };
}

export function parseTeams(table: string[][], lines: number[]) {
  const [header, ...body] = table;
  const rows: TeamRow[] = [];
  const problems: RowProblem[] = [];
  if (!header) return { rows, ...fileProblem("empty_file") };
  const col = columns(header, TEAM_ALIASES);
  if (!col.has("name")) return { rows, ...fileProblem("missing_name_column") };
  const seen = new Set<string>();
  body.forEach((cells, i) => {
    const line = lines[i + 1] ?? i + 2;
    const get = (f: keyof typeof TEAM_ALIASES) => cells[col.get(f) ?? -1]?.trim() || null;
    const name = get("name");
    if (!name) {
      problems.push({ line, error: "missing_name" });
      return;
    }
    const categoryRaw = get("category");
    const category = categoryRaw ? categoryOf(categoryRaw) : "mixed";
    if (!category) {
      problems.push({ line, error: "invalid_category" });
      return;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      problems.push({ line, error: "duplicate_in_file" });
      return;
    }
    seen.add(key);
    rows.push({
      line,
      name,
      ageGroup: get("ageGroup"),
      category,
      organisation: get("organisation"),
    });
  });
  return { rows, problems };
}
