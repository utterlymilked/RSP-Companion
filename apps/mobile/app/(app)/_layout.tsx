import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, useWindowDimensions } from "react-native";
import { useMe } from "../../src/auth/session";
import { useBarPreference } from "../../src/features/navigation/barPreference";
import { usePushRegistration } from "../../src/features/notifications/usePushRegistration";
import { barFor, TABS } from "../../src/navigation";
import { fontSize, useColors } from "../../src/theme";
import { UnderHeader } from "../../src/ui/Screen";

/**
 * Signed-in area: the bottom bar is the user's choice (default Reservas, Scouting, Perfil), filtered
 * by modules and permissions, with Definições always last ("Mais" when the bar overflows). The
 * other screens open from there and show a back arrow to it. See ADR 0029.
 */
export default function AppLayout() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const me = useMe().data;
  const permissions = me?.permissions ?? [];
  const modules = me?.modules; // absent from an older server: no filtering
  usePushRegistration();
  const { saved } = useBarPreference(me?.user.id);
  const { bar, collector } = barFor(saved, permissions, modules);
  // On desktop-width screens the bar moves to a side rail instead of stretching across the page.
  const rail = useWindowDimensions().width >= 900;
  return (
    <UnderHeader.Provider value>
      <Tabs
        screenOptions={{
          tabBarPosition: rail ? "left" : "bottom",
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            // On web the default 48px bar clips the labels' descenders.
            ...(Platform.OS === "web" && !rail
              ? { height: 60, paddingTop: 4, paddingBottom: 6 }
              : null),
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600", lineHeight: 15, flexShrink: 0 },
          headerStyle: { backgroundColor: colors.header },
          headerTintColor: colors.onHeader,
          headerTitleStyle: { fontWeight: "700", fontSize: fontSize.lg },
          headerShadowVisible: false,
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        {[...TABS]
          .sort((a, b) => order(bar, a.name) - order(bar, b.name))
          .map((tab) => {
            const inBar = bar.includes(tab.name);
            return (
              <Tabs.Screen
                key={tab.name}
                name={tab.name}
                options={{
                  title: t(tab.titleKey),
                  ...("barLabelKey" in tab ? { tabBarLabel: t(tab.barLabelKey) } : {}),
                  ...(tab.name === "more" && collector ? { tabBarLabel: t("tabs.collector") } : {}),
                  // Tabs are listed in the user's order (Expo Router orders by declaration).
                  href: inBar ? undefined : null,
                  tabBarIcon: ({ color, size, focused }) => (
                    <Ionicons
                      name={focused ? tab.icon : (`${tab.icon}-outline` as typeof tab.icon)}
                      color={color}
                      size={size}
                    />
                  ),
                  headerShown: tab.name !== "index",
                  headerLeft: inBar
                    ? undefined
                    : () => (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t("common.back")}
                          onPress={() => router.navigate("/more")}
                          hitSlop={12}
                          style={{ paddingHorizontal: 16 }}
                        >
                          <Ionicons name="chevron-back" size={24} color={colors.onHeader} />
                        </Pressable>
                      ),
                }}
              />
            );
          })}
      </Tabs>
    </UnderHeader.Provider>
  );
}

const order = (bar: readonly string[], name: string) => {
  const i = bar.indexOf(name);
  return i < 0 ? bar.length : i;
};
