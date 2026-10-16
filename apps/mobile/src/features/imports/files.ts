import { type ImportKind, type ImportReport, XLSX_CONTENT_TYPE } from "@rsc/shared";
import * as DocumentPicker from "expo-document-picker";
import { API_ORIGIN, isWeb, sessionHeaders } from "../../auth/client";
import { jsonOrThrow } from "../../errors";

/** A spreadsheet chosen from the device. `file` is set on the web. */
export interface PickedSheet {
  uri: string;
  name: string;
  file?: Blob;
}

/** Lets the user pick an Excel file; null when they cancel. */
export async function pickSpreadsheet(): Promise<PickedSheet | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [XLSX_CONTENT_TYPE],
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, name: asset.name, file: asset.file } : null;
}

/** Sends the file as the raw body; `apply: false` only previews. Throws ApiRequestError. */
export async function sendImport(
  kind: ImportKind,
  sheet: PickedSheet,
  apply: boolean,
): Promise<ImportReport> {
  const body = sheet.file ?? (await (await fetch(sheet.uri)).blob());
  const res = await fetch(`${API_ORIGIN}/api/imports/${kind}/${apply ? "apply" : "preview"}`, {
    method: "POST",
    headers: { ...(await sessionHeaders()), "content-type": XLSX_CONTENT_TYPE },
    credentials: isWeb ? "same-origin" : "omit",
    body,
  });
  return jsonOrThrow<ImportReport>(res);
}

/** Downloads the empty template: a browser download on the web, the share sheet on phones. */
export async function saveTemplate(kind: ImportKind): Promise<void> {
  const url = `${API_ORIGIN}/api/imports/${kind}/template`;
  const name = kind === "players" ? "modelo-jogadores.xlsx" : "modelo-equipas.xlsx";
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
  await Sharing.shareAsync(file.uri, { mimeType: XLSX_CONTENT_TYPE, dialogTitle: name });
}
