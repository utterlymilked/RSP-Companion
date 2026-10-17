import { createContext, type ReactNode, useContext } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { spacing, useColors } from "../theme";

/** True inside the tabs, where a navigation header already sits above the screen. */
export const UnderHeader = createContext(false);

/**
 * A scrollable, keyboard-aware page with the app's background and a readable max width.
 * `overlay` floats above the scroll view (a "+" button). `wide` lifts the max width for
 * content that needs room, such as a week timetable; keep its text controls in a `Narrow`.
 */
export function Screen({
  children,
  overlay,
  wide,
}: {
  children: ReactNode;
  overlay?: ReactNode;
  wide?: boolean;
}) {
  const colors = useColors();
  const underHeader = useContext(UnderHeader);
  return (
    <SafeAreaView
      edges={underHeader ? ["left", "right"] : ["top", "left", "right", "bottom"]}
      style={[styles.flex, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.column, wide && styles.wide]}>{children}</View>
        </ScrollView>
        {overlay}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The readable column inside a `wide` Screen, so controls stay where they are in the others. */
export function Narrow({ children }: { children: ReactNode }) {
  return <View style={styles.narrow}>{children}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.md, paddingBottom: spacing.xl * 3 },
  column: { width: "100%", maxWidth: 560, alignSelf: "center", gap: spacing.md },
  wide: { maxWidth: 1280 },
  narrow: { width: "100%", maxWidth: 560, alignSelf: "center", gap: spacing.md },
});
