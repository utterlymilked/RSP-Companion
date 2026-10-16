import { Platform, Share } from "react-native";

/** Hands a CSV to the user: a file download on the web, the share sheet on phones. */
export async function saveCsv(filename: string, csv: string): Promise<void> {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ message: csv, title: filename });
}
