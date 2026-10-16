import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
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
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.sheetHost}
    >
      <Pressable
        accessibilityLabel={t("common.close")}
        style={[styles.backdrop, { backgroundColor: colors.backdrop }]}
        onPress={onClose}
      />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.sm },
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
      </View>
    </KeyboardAvoidingView>
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
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Sheet label={title} onClose={onClose}>
        <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      </Sheet>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
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
