import { IMPORT_TEMPLATE_HEADERS, type ImportKind } from "@rsc/shared";
import ExcelJS from "exceljs";

/** Lisbon wall-clock date of an Excel date cell as YYYY-MM-DD (cells are stored as UTC midnight). */
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return isoDate(value);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text);
    return "";
  }
  return String(value);
}

/**
 * Reads the first worksheet of an .xlsx file as rows of trimmed text (header row first).
 * Dates become YYYY-MM-DD; fully empty rows are skipped but keep their row numbers via
 * `lines`, so errors point at the right row of the spreadsheet.
 */
export async function readTable(
  data: ArrayBuffer | Uint8Array,
): Promise<{ table: string[][]; lines: number[] } | null> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(data as unknown as ArrayBuffer);
  } catch {
    return null;
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return null;
  const table: string[][] = [];
  const lines: number[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, line) => {
    const cells: string[] = [];
    for (let c = 1; c <= row.cellCount; c++) cells.push(cellText(row.getCell(c).value).trim());
    if (cells.some((v) => v !== "")) {
      table.push(cells);
      lines.push(line);
    }
  });
  return { table, lines };
}

const NOTES: Record<ImportKind, { sheet: string; lines: string[] }> = {
  players: {
    sheet: "Jogadores",
    lines: [
      "Uma linha por jogador. Preencha só o que sabe: basta um Nome ou um Alias.",
      "Sem Nome, o jogador fica sem dados pessoais e é identificado pelo Alias e pelo Código.",
      "Código: deixe vazio para novos jogadores; use o código existente para atualizar.",
      "Sexo: Masculino ou Feminino. Data de nascimento: AAAA-MM-DD ou DD/MM/AAAA.",
      "Posição: Guarda-redes, Defesa, Médio ou Avançado. Pé preferencial: Esquerdo, Direito ou Ambos.",
      "Equipa: nome de uma equipa da época atual (importe primeiro as equipas).",
    ],
  },
  teams: {
    sheet: "Equipas",
    lines: [
      "Uma linha por equipa da época atual.",
      "Escalão: nome de um escalão já criado nesta época (por exemplo Sub-13). Opcional.",
      "Categoria: Masculino, Feminino ou Misto.",
      "Organização: deixe vazio para usar o clube.",
    ],
  },
};

/** Empty template workbook for a kind: a header row plus a sheet of instructions. */
export async function buildTemplate(kind: ImportKind): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(NOTES[kind].sheet);
  const headers = IMPORT_TEMPLATE_HEADERS[kind];
  sheet.addRow([...headers]);
  sheet.getRow(1).font = { bold: true };
  headers.forEach((_, i) => {
    sheet.getColumn(i + 1).width = 22;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const help = workbook.addWorksheet("Instruções");
  help.getColumn(1).width = 110;
  for (const line of NOTES[kind].lines) help.addRow([line]);
  return workbook.xlsx.writeBuffer();
}
