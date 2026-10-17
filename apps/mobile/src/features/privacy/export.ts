import * as Linking from "expo-linking";
import { Share } from "react-native";
import { api } from "../../api";
import { API_ORIGIN, isWeb } from "../../auth/client";
import { jsonOrThrow } from "../../errors";

/**
 * Hands the user a copy of a person's data (JSON). The browser downloads it from the API
 * with the session cookie; the phones fetch it and open the share sheet (save to Files,
 * send by email).
 */
export async function shareExport(personId: string): Promise<void> {
  if (isWeb) {
    await Linking.openURL(`${API_ORIGIN}/api/privacy/people/${personId}/export`);
    return;
  }
  const data = await jsonOrThrow(
    await api.privacy.people[":personId"].export.$get({ param: { personId } }),
  );
  await Share.share({ title: "SFF RSC", message: JSON.stringify(data, null, 2) });
}
