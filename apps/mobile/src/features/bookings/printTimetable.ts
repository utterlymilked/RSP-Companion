import { TIMETABLE_STEP, type TimetableSheet } from "@rsc/shared";
import { type BookingSummary, whoOf } from "./occupancy";
import { clockTime, dateParts, minutesToClock } from "./time";

export interface PrintLabels {
  heading: string;
  week: string;
  printed: string;
  legend: { free: string; confirmed: string; request: string; via: string };
  activity: (booking: BookingSummary) => string;
  locale: string;
}

const esc = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );

const CSS = `
@page{size:A4 landscape;margin:10mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font:11px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1a2230;background:#fff}
section{break-after:page;page-break-after:always}
section:last-of-type{break-after:auto;page-break-after:auto}
h1{font-size:20px;margin:0}
.sub{color:#5b6675;margin:2px 0 10px;font-size:12px}
.wrap{display:flex}
.gut{width:40px;flex:none}
.days{flex:1;display:flex;border-top:1px solid #b9c2cd;border-right:1px solid #b9c2cd}
.day{flex:1;border-left:1px solid #b9c2cd;min-width:0}
.hd{background:#eef2f6;border-bottom:1px solid #b9c2cd;text-align:center;font-weight:700;padding:3px 0;height:var(--head)}
.marks{display:flex;font-weight:400;color:#5b6675;font-size:9px}.marks span{flex:1}
.body{position:relative;border-bottom:1px solid #b9c2cd}
.ln{position:absolute;left:0;right:0;border-top:1px solid #dde3ea}.ln.h{border-top-color:#b9c2cd}
.sep{position:absolute;top:0;bottom:0;border-left:1px dotted #b9c2cd}
.hr{position:absolute;right:4px;font-size:9px;font-weight:700;color:#5b6675}
.b{position:absolute;border-radius:3px;border-left:3px solid #1f5f9e;background:#dcebfa;padding:1px 3px;overflow:hidden;font-size:9px;line-height:1.2}
.b.r{border-left-color:#c99a06;background:#fff1c2}
.b.v{border:1px dashed #8a94a3;background:#ececec}
.b strong{display:block}
.legend{display:flex;gap:14px;margin-top:8px;font-size:10px;color:#5b6675}
.legend i{display:inline-block;width:11px;height:11px;border:1px solid #8a94a3;border-radius:3px;vertical-align:-2px;margin-right:4px}
`;

/** The printable page: one A4 landscape sheet per pitch (or room), drawn like the app's grid. */
export function timetableHtml(
  sheets: TimetableSheet<BookingSummary>[],
  range: { from: number; to: number },
  labels: PrintLabels,
): string {
  const rows = ((range.to - range.from) * 60) / TIMETABLE_STEP;
  const row = Math.max(14, Math.min(34, Math.floor(500 / rows)));
  const sections = sheets.map((sheet) => {
    const head = sheet.columns > 1 ? 36 : 22;
    const lines = Array.from(
      { length: rows },
      (_, r) => `<div class="ln${r % 2 === 0 ? " h" : ""}" style="top:${r * row}px"></div>`,
    ).join("");
    const hours = Array.from({ length: range.to - range.from }, (_, i) => {
      const top = i * 2 * row;
      return `<div class="hr" style="top:${top + 1}px">${minutesToClock((range.from + i) * 60)}</div>`;
    }).join("");
    const separators = Array.from(
      { length: sheet.columns - 1 },
      (_, c) => `<div class="sep" style="left:${((c + 1) / sheet.columns) * 100}%"></div>`,
    ).join("");
    const days = sheet.days
      .map(({ date, blocks }) => {
        const parts = dateParts(date, labels.locale);
        const marks =
          sheet.columns > 1
            ? `<div class="marks">${sheet.columnMarks.map((m) => `<span>${esc(m)}</span>`).join("")}</div>`
            : "";
        const cells = blocks
          .map((block) => {
            const span = (block.toUnit - block.fromUnit) / 12;
            const top = ((block.startMin - range.from * 60) / TIMETABLE_STEP) * row;
            const height = ((block.endMin - block.startMin) / TIMETABLE_STEP) * row - 1;
            const { booking } = block;
            const detail = [
              booking.title ?? labels.activity(booking),
              block.via ? booking.spaceName : "",
              `${clockTime(booking.startsAt)}–${clockTime(booking.endsAt)}`,
            ]
              .filter(Boolean)
              .map(esc)
              .join("<br>");
            const kind = block.via ? " v" : booking.status === "to_confirm" ? " r" : "";
            return `<div class="b${kind}" style="top:${top}px;height:${height}px;left:${(block.fromUnit / 12 + (span * block.lane) / block.lanes) * 100}%;width:${(span / block.lanes) * 100}%"><strong>${esc(whoOf(booking))}</strong>${detail}</div>`;
          })
          .join("");
        return `<div class="day"><div class="hd" style="--head:${head}px">${esc(`${parts.weekday.replace(".", "")} ${parts.day}`)}${marks}</div><div class="body" style="height:${rows * row}px">${lines}${separators}${cells}</div></div>`;
      })
      .join("");
    return `<section><h1>${esc(`${labels.heading} · ${sheet.space.name}`)}</h1><div class="sub">${esc(labels.week)}</div><div class="wrap"><div class="gut"><div style="height:${head + 1}px"></div><div style="position:relative;height:${rows * row}px">${hours}</div></div><div class="days">${days}</div></div><div class="legend"><span><i style="background:#dcebfa;border-color:#1f5f9e"></i>${esc(labels.legend.confirmed)}</span><span><i style="background:#fff1c2;border-color:#c99a06"></i>${esc(labels.legend.request)}</span><span><i style="background:#ececec;border-style:dashed"></i>${esc(labels.legend.via)}</span><span><i style="background:#fff"></i>${esc(labels.legend.free)}</span><span style="margin-left:auto">${esc(labels.printed)}</span></div></section>`;
  });
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(labels.heading)} · ${esc(labels.week)}</title><style>${CSS}</style></head><body>${sections.join("")}</body></html>`;
}

/** Opens the printable page in a new window and starts printing (web only). False when blocked. */
export function printTimetable(html: string): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
  return true;
}
