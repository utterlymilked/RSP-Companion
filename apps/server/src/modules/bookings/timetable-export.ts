import {
  addLocalDays,
  type BookingStatus,
  localDateString,
  parseLocal,
  TIMETABLE_STEP,
  type TimetableBooking,
  type TimetableSheet,
} from "@rsc/shared";
import ExcelJS from "exceljs";
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";

/** A booking with the names the timetable prints. */
export interface ExportBooking extends TimetableBooking {
  spaceName: string;
  teamName: string | null;
  createdByName: string | null;
  departmentName: string;
  title: string | null;
}

export interface TimetableModel {
  /** "Campos" or "Salas". */
  heading: string;
  /** "19 – 25 out. 2026". */
  weekTitle: string;
  days: string[];
  range: { from: number; to: number };
  sheets: TimetableSheet<ExportBooking>[];
}

// The files are for printing and the club works in Portuguese, so their text is not translated.
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MONTHS = [
  "jan.",
  "fev.",
  "mar.",
  "abr.",
  "mai.",
  "jun.",
  "jul.",
  "ago.",
  "set.",
  "out.",
  "nov.",
  "dez.",
];

/** The seven dates of the Monday-to-Sunday week that contains `date`. */
export function weekOf(date: string): string[] {
  const local = parseLocal(date);
  if (!local) return [];
  const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
  const monday = addLocalDays(local, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => localDateString(addLocalDays(monday, i)));
}

/** "19 – 25 out. 2026", or "28 set. – 4 out. 2026" across months. */
export function weekTitle(days: string[]): string {
  const [first, last] = [days[0], days.at(-1)].map((d) => parseLocal(d ?? "")) as [
    ReturnType<typeof parseLocal>,
    ReturnType<typeof parseLocal>,
  ];
  if (!first || !last) return "";
  const month = (m: number) => MONTHS[m - 1];
  return first.month === last.month
    ? `${first.day} – ${last.day} ${month(last.month)} ${last.year}`
    : `${first.day} ${month(first.month)} – ${last.day} ${month(last.month)} ${last.year}`;
}

const dayLabel = (date: string, index: number) => {
  const local = parseLocal(date);
  return `${WEEKDAYS[index]} ${local ? `${String(local.day).padStart(2, "0")}/${String(local.month).padStart(2, "0")}` : ""}`;
};
const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const who = (b: ExportBooking) => b.teamName ?? b.createdByName ?? b.departmentName;
/** What a block says: who has it, what for, and the hours. */
const lines = (b: ExportBooking, startMin: number, endMin: number, via: boolean) => [
  who(b),
  ...(b.title ? [b.title] : []),
  ...(via ? [`(${b.spaceName})`] : []),
  `${clock(startMin)}–${clock(endMin)}${b.status === "to_confirm" ? " · a confirmar" : ""}`,
];
const FILL: Record<"booked" | "request" | "via", string> = {
  booked: "DCEBFA",
  request: "FFF1C2",
  via: "ECECEC",
};
const fillOf = (status: BookingStatus, via: boolean) =>
  via ? FILL.via : status === "to_confirm" ? FILL.request : FILL.booked;

/** Rows of the grid: one per `TIMETABLE_STEP` minutes of the range. */
const rowsOf = (range: { from: number; to: number }) =>
  ((range.to - range.from) * 60) / TIMETABLE_STEP;
/** First and last (exclusive) column of a block among a day's `columns`. */
const columnsOf = (fromUnit: number, toUnit: number, columns: number, units = 12) => {
  const width = units / columns;
  return {
    from: Math.min(columns - 1, Math.floor(fromUnit / width)),
    to: Math.max(1, Math.ceil(toUnit / width)),
  };
};

const sheetName = (name: string, taken: Set<string>) => {
  let base = name.replace(/[:\\/?*[\]]/g, " ").slice(0, 28) || "Folha";
  for (let i = 2; taken.has(base); i++) base = `${base.slice(0, 25)} ${i}`;
  taken.add(base);
  return base;
};

/** An Excel workbook with one sheet per pitch (or room): time rows, a column group per day. */
export async function buildTimetableXlsx(model: TimetableModel): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SFF RSC";
  const names = new Set<string>();
  const thin = { style: "thin", color: { argb: "FFBFC7D1" } } as const;
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const rows = rowsOf(model.range);
  for (const sheet of model.sheets) {
    const ws = workbook.addWorksheet(sheetName(sheet.space.name, names), {
      views: [{ state: "frozen", xSplit: 1, ySplit: 4 }],
      pageSetup: {
        orientation: "landscape",
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
      },
    });
    const width = sheet.columns;
    const lastCol = 1 + 7 * width;
    ws.mergeCells(1, 1, 1, lastCol);
    ws.getCell(1, 1).value = `${model.heading} · ${sheet.space.name}`;
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    ws.mergeCells(2, 1, 2, lastCol);
    ws.getCell(2, 1).value =
      `Semana de ${model.weekTitle} · ${clock(model.range.from * 60)}–${clock(model.range.to * 60)}`;
    ws.getCell(2, 1).font = { color: { argb: "FF5B6675" } };
    ws.getColumn(1).width = 8;
    ws.getCell(4, 1).value = "Hora";
    ws.getCell(4, 1).font = { bold: true };
    ws.getCell(4, 1).border = border;
    ws.getCell(3, 1).border = border;
    for (let d = 0; d < 7; d++) {
      const first = 2 + d * width;
      if (width > 1) ws.mergeCells(3, first, 3, first + width - 1);
      ws.getCell(3, first).value = dayLabel(model.days[d] ?? "", d);
      ws.getCell(3, first).font = { bold: true };
      ws.getCell(3, first).alignment = { horizontal: "center" };
      for (let c = 0; c < width; c++) {
        ws.getColumn(first + c).width = width > 1 ? 13 : 22;
        ws.getCell(3, first + c).border = border;
        const mark = ws.getCell(4, first + c);
        mark.value = sheet.columnMarks[c] ?? "";
        mark.alignment = { horizontal: "center" };
        mark.font = { color: { argb: "FF5B6675" } };
        mark.border = border;
      }
    }
    // Every cell gets its border and the time on its row; bookings are merged over them.
    for (let r = 0; r < rows; r++) {
      const row = 5 + r;
      const label = ws.getCell(row, 1);
      label.value = clock(model.range.from * 60 + r * TIMETABLE_STEP);
      label.font = { bold: r % 2 === 0, color: { argb: r % 2 === 0 ? "FF000000" : "FF8A94A3" } };
      label.border = border;
      for (let c = 2; c <= lastCol; c++) ws.getCell(row, c).border = border;
    }
    const used = new Set<string>();
    for (let d = 0; d < 7; d++) {
      for (const block of sheet.days[d]?.blocks ?? []) {
        const { from, to } = columnsOf(block.fromUnit, block.toUnit, width);
        const top = 5 + Math.floor((block.startMin - model.range.from * 60) / TIMETABLE_STEP);
        const bottom = 5 + Math.ceil((block.endMin - model.range.from * 60) / TIMETABLE_STEP) - 1;
        const left = 2 + d * width + from;
        const right = 2 + d * width + to - 1;
        const cells = [];
        for (let r = top; r <= bottom; r++)
          for (let c = left; c <= right; c++) cells.push(`${r}:${c}`);
        const text = lines(block.booking, block.startMin, block.endMin, block.via).join("\n");
        const taken = cells.some((key) => used.has(key));
        if (taken) {
          // Two requests for the same slot: keep both names in the first block's cell.
          const cell = ws.getCell(top, left);
          cell.value = `${cell.value ?? ""}\n+ ${text}`;
          continue;
        }
        for (const key of cells) used.add(key);
        if (top !== bottom || left !== right) ws.mergeCells(top, left, bottom, right);
        const cell = ws.getCell(top, left);
        cell.value = text;
        cell.alignment = { wrapText: true, vertical: "top" };
        cell.font = { size: 9 };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: `FF${fillOf(block.booking.status, block.via)}` },
        };
      }
    }
    for (let r = 0; r < rows; r++) ws.getRow(5 + r).height = 24;
  }
  if (model.sheets.length === 0) {
    workbook.addWorksheet("Horário").getCell(1, 1).value = "Sem espaços para mostrar.";
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

const PDF = { width: 842, height: 595, margin: 28 } as const;
const ink = rgb(0.1, 0.13, 0.18);
const muted = rgb(0.36, 0.4, 0.46);
const edge = rgb(0.72, 0.76, 0.81);
const hex = (h: string) =>
  rgb(
    Number.parseInt(h.slice(0, 2), 16) / 255,
    Number.parseInt(h.slice(2, 4), 16) / 255,
    Number.parseInt(h.slice(4, 6), 16) / 255,
  );

/** Keeps the characters the standard PDF font can draw (Portuguese accents included). */
const printable = (font: PDFFont, text: string) => {
  const known = font.getCharacterSet();
  return [...text].map((ch) => (known.includes(ch.codePointAt(0) ?? 0) ? ch : "?")).join("");
};

/** `text` broken into lines no wider than `width`. */
function wrap(font: PDFFont, size: number, text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of printable(font, text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out;
}

/** A PDF with one landscape A4 page per pitch (or room): the same grid as the app. */
export async function buildTimetablePdf(model: TimetableModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Horário semanal · ${model.heading} · ${model.weekTitle}`);
  pdf.setCreator("SFF RSC");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const text = (
    page: PDFPage,
    value: string,
    x: number,
    y: number,
    size: number,
    f = regular,
    color = ink,
  ) => page.drawText(printable(f, value), { x, y, size, font: f, color });
  const rows = rowsOf(model.range);
  const gutter = 36;
  const left = PDF.margin + gutter;
  const gridWidth = PDF.width - PDF.margin - left;
  const dayWidth = gridWidth / 7;
  const top = PDF.height - 86;
  const header = 30;
  const bottom = PDF.margin + 18;
  const rowHeight = Math.min(34, (top - header - bottom) / rows);
  const gridTop = top - header;
  for (const sheet of model.sheets) {
    const page = pdf.addPage([PDF.width, PDF.height]);
    text(page, `${model.heading} · ${sheet.space.name}`, PDF.margin, PDF.height - 46, 20, bold);
    text(
      page,
      `Semana de ${model.weekTitle} · ${clock(model.range.from * 60)}–${clock(model.range.to * 60)}`,
      PDF.margin,
      PDF.height - 64,
      10,
      regular,
      muted,
    );
    const yOf = (minutes: number) =>
      gridTop - ((minutes - model.range.from * 60) / TIMETABLE_STEP) * rowHeight;
    for (let d = 0; d < 7; d++) {
      const x = left + d * dayWidth;
      page.drawRectangle({
        x,
        y: gridTop,
        width: dayWidth,
        height: header,
        color: hex("EEF2F6"),
        borderColor: edge,
        borderWidth: 0.5,
      });
      text(
        page,
        dayLabel(model.days[d] ?? "", d),
        x + 5,
        gridTop + (sheet.columns > 1 ? 16 : 10),
        9,
        bold,
      );
      for (let c = 0; c < sheet.columns && sheet.columns > 1; c++) {
        text(
          page,
          sheet.columnMarks[c] ?? "",
          x + (c + 0.5) * (dayWidth / sheet.columns) - 2,
          gridTop + 4,
          7,
          regular,
          muted,
        );
      }
      page.drawRectangle({
        x,
        y: yOf(model.range.to * 60),
        width: dayWidth,
        height: rows * rowHeight,
        borderColor: edge,
        borderWidth: 0.5,
      });
      for (let c = 1; c < sheet.columns; c++) {
        const cx = x + c * (dayWidth / sheet.columns);
        page.drawLine({
          start: { x: cx, y: gridTop },
          end: { x: cx, y: yOf(model.range.to * 60) },
          thickness: 0.3,
          color: edge,
        });
      }
    }
    for (let r = 0; r <= rows; r++) {
      const y = gridTop - r * rowHeight;
      const full = r % 2 === 0;
      page.drawLine({
        start: { x: left, y },
        end: { x: left + gridWidth, y },
        thickness: full ? 0.5 : 0.2,
        color: edge,
      });
      if (r < rows) {
        text(
          page,
          clock(model.range.from * 60 + r * TIMETABLE_STEP),
          PDF.margin,
          y - 9,
          7,
          full ? bold : regular,
          full ? ink : muted,
        );
      }
    }
    for (let d = 0; d < 7; d++) {
      const x = left + d * dayWidth;
      for (const block of sheet.days[d]?.blocks ?? []) {
        const width = ((block.toUnit - block.fromUnit) / 12) * dayWidth;
        const lane = width / block.lanes;
        const bx = x + (block.fromUnit / 12) * dayWidth + block.lane * lane + 0.5;
        const by = yOf(block.endMin);
        const height = yOf(block.startMin) - by;
        page.drawRectangle({
          x: bx,
          y: by + 0.5,
          width: lane - 1,
          height: height - 1,
          color: hex(fillOf(block.booking.status, block.via)),
          borderColor: block.booking.status === "to_confirm" ? hex("C99A06") : hex("5B8DB8"),
          borderWidth: 0.6,
        });
        const size = lane < 50 ? 6 : 7.5;
        const parts = lines(block.booking, block.startMin, block.endMin, block.via);
        let y = by + height - size - 2;
        for (const [i, part] of parts.entries()) {
          for (const row of wrap(i === 0 ? bold : regular, size, part, lane - 6)) {
            if (y < by + 1) break;
            text(page, row, bx + 3, y, size, i === 0 ? bold : regular);
            y -= size + 1.5;
          }
        }
      }
    }
    text(
      page,
      "Azul: confirmado · Amarelo: a confirmar · Cinzento: reservado através de outro espaço · Espaços em branco: livres",
      PDF.margin,
      PDF.margin,
      7,
      regular,
      muted,
    );
  }
  if (model.sheets.length === 0) {
    text(
      pdf.addPage([PDF.width, PDF.height]),
      "Sem espaços para mostrar.",
      PDF.margin,
      PDF.height - 60,
      14,
      bold,
    );
  }
  return pdf.save();
}
