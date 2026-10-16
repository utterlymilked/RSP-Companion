import type { PushPlatform } from "@rsc/shared";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "../../api";

export interface PushRegistration {
  token: string;
  platform: PushPlatform;
}

/**
 * Asks for permission and returns this phone's Expo push token, or null on the web, in a
 * simulator, when the user declines, or before the build has an EAS project id. Never throws:
 * push is an extra, the inbox works without it.
 */
export async function getPushRegistration(): Promise<PushRegistration | null> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { token: data, platform: Platform.OS };
  } catch {
    return null;
  }
}

/** Shows pushes that arrive while the app is open as a banner, without sound. */
export function showForegroundPushes() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/** Tells the API to stop pushing to this phone (sign-out). Best effort; never prompts. */
export async function unregisterPush(): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (status !== "granted" || !projectId) return;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.notifications.devices.$delete({ json: { token: data } });
  } catch {
    // Offline or no token: the token moves to the next user who signs in on this phone.
  }
}
