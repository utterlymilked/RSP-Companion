import type { DocumentKind } from "@rsc/shared";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { guardedFetch } from "../../app-client";
import { API_ORIGIN, isWeb, sessionHeaders } from "../../auth/client";
import { jsonOrThrow } from "../../errors";

/** A file chosen from the device, ready to upload. `file` is set on the web. */
export interface PickedFile {
  uri: string;
  name: string;
  type: string;
  file?: Blob;
}

/** Lets the user pick a PDF or a photo from the device; null when they cancel. */
export async function pickFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/jpeg", "image/png"],
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType ?? "application/pdf",
    file: asset.file,
  };
}

/** Takes a photo with the camera (native only); null when denied or cancelled. */
export async function takePhoto(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    name: asset.fileName ?? `foto-${Date.now()}.jpg`,
    type: asset.mimeType ?? "image/jpeg",
  };
}

export const cameraAvailable = !isWeb;

export interface UploadMeta {
  kind: DocumentKind;
  title: string;
  issuedOn: string;
  expiresOn: string;
}

/**
 * Sends the file as the raw request body, with its metadata in the query string (the API
 * takes no multipart; ADR 0009). Throws ApiRequestError on a non-2xx answer.
 */
export async function uploadDocument(personId: string, picked: PickedFile, meta: UploadMeta) {
  const body = picked.file ?? (await (await fetch(picked.uri)).blob());
  const query = new URLSearchParams({ kind: meta.kind, fileName: picked.name });
  if (meta.title.trim()) query.set("title", meta.title.trim());
  if (meta.issuedOn.trim()) query.set("issuedOn", meta.issuedOn.trim());
  if (meta.expiresOn.trim()) query.set("expiresOn", meta.expiresOn.trim());
  const res = await guardedFetch(`${API_ORIGIN}/api/documents/people/${personId}?${query}`, {
    method: "POST",
    headers: { ...(await sessionHeaders()), "content-type": picked.type },
    credentials: isWeb ? "same-origin" : "omit",
    body,
  });
  return jsonOrThrow(res);
}

/** Makes a download URL absolute: the local storage hands out paths on the API origin. */
export const absoluteUrl = (url: string) => (url.startsWith("/") ? `${API_ORIGIN}${url}` : url);
