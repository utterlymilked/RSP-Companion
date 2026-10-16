import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { api } from "../../api";
import { getPushRegistration, showForegroundPushes } from "./push";

/**
 * While signed in on a phone: registers this device's push token with the API, refreshes the
 * inbox when a push arrives and opens it when one is tapped.
 */
export function usePushRegistration() {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (Platform.OS === "web") return;
    showForegroundPushes();
    getPushRegistration().then((registration) => {
      if (registration) void api.notifications.devices.$put({ json: registration });
    });
    const received = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });
    const tapped = Notifications.addNotificationResponseReceivedListener(() => {
      router.push("/notifications");
    });
    return () => {
      received.remove();
      tapped.remove();
    };
  }, [router, queryClient]);
}
