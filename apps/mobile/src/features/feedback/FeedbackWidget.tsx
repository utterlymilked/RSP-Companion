import Ionicons from "@expo/vector-icons/Ionicons";
import type { FeedbackKind } from "@rsc/shared";
import { useMutation } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useGlobalSearchParams, usePathname } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { api } from "../../api";
import { useMe } from "../../auth/session";
import { errorKey, jsonOrThrow } from "../../errors";
import { elevation, fontSize, radius, spacing, touchTarget, useColors } from "../../theme";
import { Button } from "../../ui/Button";
import { Choice } from "../../ui/Choice";
import { TextField } from "../../ui/TextField";
import { showToast } from "../../ui/Toast";
import { useFeedbackSettings } from "./preference";

const BUBBLE = 52;
const CARD_MAX = 340;
const EDGE = 8;
/// Taps move less than this; anything further is a drag.
const DRAG_SLOP = 6;
/// Keeps the bubble clear of the tab bar (and the "+" buttons on the right) when it first appears.
const TAB_BAR = 90;
const KINDS: FeedbackKind[] = ["bug", "idea", "question"];

/**
 * The floating feedback widget for testers: a draggable bubble that opens a small note form
 * pinned where the bubble was, and sends the note with the current screen to /api/feedback.
 * Shown to users holding `feedback.submit` (testers and admins) who have not switched it off
 * in "Conta". Rendered once above the whole navigator, so it follows the tester everywhere.
 */
export function FeedbackWidget() {
  const me = useMe().data;
  const settings = useFeedbackSettings();
  if (!me?.permissions.includes("feedback.submit") || !settings.enabled) return null;
  return <Widget saved={settings.position} onMoved={settings.setPosition} />;
}

type Point = { x: number; y: number };

function Widget({ saved, onMoved }: { saved: Point | null; onMoved: (p: Point) => void }) {
  const { t } = useTranslation();
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [moved, setMoved] = useState(false);
  const cardWidth = Math.min(CARD_MAX, width - 2 * EDGE);

  // Top-left corner of the widget, in window points.
  const [pos, setPos] = useState<Point>(saved ?? { x: EDGE, y: height - BUBBLE - TAB_BAR - 60 });
  const size = open ? { w: cardWidth, h: 330 } : { w: BUBBLE, h: BUBBLE };
  const clamp = (p: Point): Point => ({
    x: Math.max(EDGE, Math.min(width - size.w - EDGE, p.x)),
    y: Math.max(EDGE, Math.min(height - size.h - EDGE, p.y)),
  });
  const shown = clamp(pos);

  const start = useRef(shown);
  const dragged = useRef(false);
  const live = useRef({ shown, clamp, open, onMoved });
  live.current = { shown, clamp, open, onMoved };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // The bubble and the card's title are only for dragging and tapping. The capture
        // phase beats the Pressable inside the bubble; a touch that never moves past the
        // slop is a tap (web keyboards still reach the Pressable's own onPress).
        onStartShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: () => {
          start.current = live.current.shown;
          dragged.current = false;
          setSelectable(false);
        },
        onPanResponderMove: (_e, g) => {
          if (Math.abs(g.dx) + Math.abs(g.dy) <= DRAG_SLOP && !dragged.current) return;
          dragged.current = true;
          setPos(live.current.clamp({ x: start.current.x + g.dx, y: start.current.y + g.dy }));
          setMoved(true);
        },
        onPanResponderRelease: () => {
          setSelectable(true);
          if (dragged.current) live.current.onMoved(live.current.shown);
          else if (!live.current.open) setOpen(true);
        },
        onPanResponderTerminate: () => setSelectable(true),
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );

  const send = useMutation({
    mutationFn: async () =>
      jsonOrThrow(
        await api.feedback.$post({
          json: {
            kind,
            message,
            route: withQuery(pathname, params),
            screenTitle: Platform.OS === "web" && document.title ? document.title : null,
            platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web",
            appVersion: Constants.expoConfig?.version ?? null,
            viewport: { width: Math.round(width), height: Math.round(height) },
            position:
              moved || saved
                ? {
                    x: Math.round(shown.x + size.w / 2),
                    y: Math.round(shown.y + size.h / 2),
                  }
                : null,
          },
        }),
      ),
    onSuccess: () => {
      setMessage("");
      setOpen(false);
      showToast(t("feedback.sent"));
    },
  });

  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, Platform.OS === "web" && styles.webLayer]}
    >
      <View
        style={[
          styles.widget,
          elevation,
          {
            left: shown.x,
            top: shown.y,
            width: size.w,
            backgroundColor: open ? colors.surface : colors.primary,
            borderColor: colors.border,
            borderRadius: open ? radius.lg : radius.pill,
            minHeight: open ? undefined : BUBBLE,
          },
        ]}
        testID="feedback-widget"
      >
        {open ? (
          <>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <View
                {...pan.panHandlers}
                accessibilityLabel={t("feedback.drag")}
                style={[styles.handle, styles.noTouchAction]}
              >
                <Ionicons name="move" size={18} color={colors.textMuted} />
                <Text style={[styles.title, { color: colors.text }]}>{t("feedback.title")}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
                hitSlop={10}
                onPress={() => setOpen(false)}
              >
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={styles.body}>
              <Text style={[styles.where, { color: colors.textMuted }]} numberOfLines={1}>
                {t("feedback.where", { route: pathname })}
              </Text>
              <Choice
                label={t("feedback.kind")}
                value={kind}
                onChange={setKind}
                options={KINDS.map((k) => ({ value: k, label: t(`feedback.kinds.${k}`) }))}
              />
              <TextField
                label={t("feedback.message")}
                value={message}
                onChangeText={setMessage}
                multiline
                autoCapitalize="sentences"
              />
              {send.isError ? (
                <Text style={{ color: colors.danger, fontSize: fontSize.sm }}>
                  {t(errorKey(send.error))}
                </Text>
              ) : null}
              <Button
                label={t("feedback.send")}
                icon="send"
                busy={send.isPending}
                disabled={message.trim().length < 3}
                onPress={() => send.mutate()}
              />
            </View>
          </>
        ) : (
          <View {...pan.panHandlers} style={styles.noTouchAction}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("feedback.open")}
              onPress={() => !dragged.current && setOpen(true)}
              style={styles.bubble}
            >
              <Ionicons name="chatbubble-ellipses" size={26} color={colors.onPrimary} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

/** On the web, dragging would otherwise select the text under the pointer. */
function setSelectable(on: boolean) {
  if (Platform.OS === "web") document.body.style.userSelect = on ? "" : "none";
}

/** `/booking/new?space=…`: the path with its query, so the screen can be reopened as seen. */
function withQuery(pathname: string, params: Record<string, string | string[] | undefined>) {
  const query = Object.entries(params)
    .filter(([, v]) => typeof v === "string")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
    .join("&");
  return query ? `${pathname}?${query}` : pathname;
}

const styles = StyleSheet.create({
  // The layer must not block the app underneath; only the widget takes touches.
  webLayer: { zIndex: 1000 },
  widget: { position: "absolute", borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  noTouchAction: Platform.select({ web: { touchAction: "none", cursor: "grab" } as object }) ?? {},
  bubble: { width: BUBBLE, height: BUBBLE, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  handle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: touchTarget,
  },
  title: { flex: 1, fontSize: fontSize.md, fontWeight: "700" },
  body: { padding: spacing.md, gap: spacing.sm },
  where: { fontSize: fontSize.xs },
});
