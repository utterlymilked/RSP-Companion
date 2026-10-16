import Ionicons from "@expo/vector-icons/Ionicons";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { elevation, fontSize, radius, spacing, useColors } from "../theme";

/** A bottom sheet with a title and a close button (the content of a Modal). */
export function Sheet({
  label,
  onClose,
  children,
  progress,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  /** 0 hidden, 1 shown; driven by `SheetModal` so the backdrop fades while the sheet slides. */
  progress?: Animated.Value;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.sheetHost}
    >
      <Animated.View
        pointerEvents="box-none"
        style={[styles.backdrop, progress && { opacity: progress }]}
      >
        <Pressable
          accessibilityLabel={t("common.close")}
          style={[styles.fill, { backgroundColor: colors.backdrop }]}
          onPress={onClose}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.sm },
          progress && {
            transform: [
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [SLIDE, 0] }) },
            ],
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <View style={styles.sheetHeader}>
          <Text accessibilityRole="header" style={[styles.sheetTitle, { color: colors.text }]}>
            {label}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
            hitSlop={8}
            onPress={onClose}
          >
            <Ionicons name="close" size={24} color={colors.textMuted} />
          </Pressable>
        </View>
        {children}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

/** How far the sheet travels while it slides in, more than any sheet is tall. */
const SLIDE = 600;
const native = Platform.OS !== "web";

/**
 * A Modal for sheets with the animation done right: the backdrop only fades and the sheet
 * slides on its own. The built-in "slide" animation moves the whole window, backdrop included,
 * which looks like a shutter coming down. Stays mounted until the exit animation ends.
 */
export function SheetModal({
  visible,
  onClose,
  label,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: native,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, progress]);
  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      <Sheet label={label} onClose={onClose} progress={progress}>
        {children}
      </Sheet>
    </Modal>
  );
}

/**
 * A sheet that slides up over the screen with scrollable content, like a place in Google Maps:
 * details of something tapped without leaving the screen. Closes on the backdrop or the ×.
 */
export function BottomSheet({
  title,
  visible,
  onClose,
  children,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <SheetModal visible={visible} label={title} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  fill: { flex: 1 },
  sheetHost: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    maxHeight: "85%",
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.sm,
    ...elevation,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sheetTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: "800" },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.md },
});
