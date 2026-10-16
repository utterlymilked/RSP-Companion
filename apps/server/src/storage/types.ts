/** What the app needs from file storage (ADR 0009). Keys are opaque, chosen by the caller. */
export interface FileStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /**
   * A short-lived URL that downloads the file without a session. `fileName` becomes the
   * download name. The URL is the credential: never log it.
   */
  signedUrl(
    key: string,
    options: { fileName: string; contentType: string; expiresInSeconds: number },
  ): Promise<string>;
}

/** Files kept on disk (or in memory in tests), served back through `/api/documents/files/*`. */
export interface ServedStorage extends FileStorage {
  /** The file behind a token made by `signedUrl`, or null when it is invalid or expired. */
  open(
    token: string,
    now?: Date,
  ): Promise<{ body: Uint8Array; fileName: string; contentType: string } | null>;
}
