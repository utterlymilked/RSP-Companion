import { API_ORIGIN, isWeb, sessionHeaders } from "../../auth/client";
import { jsonOrThrow } from "../../errors";

export interface TimetableFileQuery {
  /** Any day of the week to export (Monday to Sunday is written). */
  week: string;
  category: "fields" | "rooms";
  from: number;
  to: number;
}

const CONTENT_TYPES = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
} as const;

/** Downloads the weekly timetable from the API: a browser download on the web, the share sheet on phones. */
export async function saveTimetable(
  format: keyof typeof CONTENT_TYPES,
  query: TimetableFileQuery,
): Promise<void> {
  const params = new URLSearchParams({ ...query, format } as unknown as Record<string, string>);
  const url = `${API_ORIGIN}/api/bookings/timetable?${params}`;
  const name = `horario-${query.category === "fields" ? "campos" : "salas"}-${query.week}.${format}`;
  if (isWeb) {
    const res = await fetch(url, { credentials: "same-origin", headers: await sessionHeaders() });
    if (!res.ok) await jsonOrThrow(res);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(await res.blob());
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }
  const { File, Paths } = await import("expo-file-system");
  const Sharing = await import("expo-sharing");
  const file = await File.downloadFileAsync(url, new File(Paths.cache, name), {
    headers: await sessionHeaders(),
    idempotent: true,
  });
  await Sharing.shareAsync(file.uri, { mimeType: CONTENT_TYPES[format], dialogTitle: name });
}
