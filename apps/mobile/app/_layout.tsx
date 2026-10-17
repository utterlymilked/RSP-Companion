import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useResolvedScheme } from "../src/appearance";
import { isWeb } from "../src/auth/client";
import { storeSessionFromUrl } from "../src/auth/deep-link";
import { refreshSession, useMe } from "../src/auth/session";
import { errorKey } from "../src/errors";
import { FeedbackWidget } from "../src/features/feedback/FeedbackWidget";
import { initI18n } from "../src/i18n";
import { connectQueriesToDevice, createQueryClient } from "../src/query";
import { Button } from "../src/ui/Button";
import { Centered } from "../src/ui/Centered";
import { Body } from "../src/ui/Text";
import { ToastHost } from "../src/ui/Toast";
import { TESTER_TOOLS } from "../src/variant";
import { useReloadOnNewRelease } from "../src/web-update";

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [ready, setReady] = useState(false);
  useReloadOnNewRelease();

  useEffect(() => {
    connectQueriesToDevice();
    initI18n().finally(() => setReady(true));
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        {ready ? <AuthGate /> : <Centered />}
        <ToastHost />
        <ThemedStatusBar />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Shows the signed-in tabs or the sign-in screens, depending on GET /api/me. */
function AuthGate() {
  const { t } = useTranslation();
  const me = useMe();
  useMagicLinkReturn();

  if (me.isPending) {
    if (me.fetchStatus !== "paused") return <Centered />;
    return (
      <Centered>
        <Body>{t("common.offline")}</Body>
      </Centered>
    );
  }
  if (me.isError) {
    return (
      <Centered>
        <Body>{t(errorKey(me.error))}</Body>
        <Button label={t("common.retry")} onPress={() => me.refetch()} />
      </Centered>
    );
  }

  const signedIn = me.data !== null;
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(app)" />
          <Stack.Screen name="announcement/new" />
          <Stack.Screen name="audit" />
          <Stack.Screen name="feedback" />
          <Stack.Screen name="booking/[bookingId]" />
          <Stack.Screen name="booking/new" />
          <Stack.Screen name="booking/mine" />
          <Stack.Screen name="equipment/[itemId]" />
          <Stack.Screen name="equipment/new" />
          <Stack.Screen name="evaluation/[personId]" />
          <Stack.Screen name="evaluation/new" />
          <Stack.Screen name="evaluation/template" />
          <Stack.Screen name="health/[personId]" />
          <Stack.Screen name="incident/[incidentId]" />
          <Stack.Screen name="incident/new" />
          <Stack.Screen name="person/[personId]" />
          <Stack.Screen name="person/new" />
          <Stack.Screen name="user/[userId]" />
          <Stack.Screen name="user/invite" />
          <Stack.Screen name="privacy/[personId]" />
          <Stack.Screen name="privacy/requests" />
          <Stack.Screen name="scouting/[prospectId]" />
          <Stack.Screen name="scouting/new" />
          <Stack.Screen name="team/[teamId]" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="forgot-password" />
        </Stack.Protected>
        <Stack.Screen name="invite" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="privacy/index" />
      </Stack>
      {signedIn && TESTER_TOOLS ? <FeedbackWidget /> : null}
    </>
  );
}

/** Native: a magic link verified in the browser comes back as rsc:///?cookie=… (ADR 0004). */
function useMagicLinkReturn() {
  const queryClient = useQueryClient();
  const url = Linking.useLinkingURL();
  useEffect(() => {
    if (isWeb || !url) return;
    storeSessionFromUrl(url).then((stored) => {
      if (stored) refreshSession(queryClient);
    });
  }, [url, queryClient]);
}

/** Light icons on a dark theme and the other way round, following the chosen appearance. */
function ThemedStatusBar() {
  return <StatusBar style={useResolvedScheme() === "dark" ? "light" : "dark"} />;
}
