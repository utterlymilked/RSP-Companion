import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, Pressable } from "react-native";
import { useMe } from "../../src/auth/session";
import { usePushRegistration } from "../../src/features/notifications/usePushRegistration";
import { canOpenTab, TABS } from "../../src/navigation";
import { fontSize, useColors } from "../../src/theme";
import { UnderHeader } from "../../src/ui/Screen";

/**
 * Signed-in area: four bottom tabs (Reservas, Scouting, Conta, Definições), filtered by the
 * user's modules and permissions. The other screens open from "Mais" and show a back arrow to it.
 */
export default function AppLayout() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const me = useMe().data;
  const permissions = me?.permissions ?? [];
  const modules = me?.modules; // absent from an older server: no filtering
  usePushRegistration();
  return (
    <UnderHeader.Provider value>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            // On web the default 48px bar clips the labels' descenders.
            ...(Platform.OS === "web" ? { height: 60, paddingTop: 4, paddingBottom: 6 } : null),
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600", lineHeight: 15, flexShrink: 0 },
          headerStyle: { backgroundColor: colors.header },
          headerTintColor: colors.onHeader,
          headerTitleStyle: { fontWeight: "700", fontSize: fontSize.lg },
          headerShadowVisible: false,
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        {TABS.map((tab) => {
          const inBar = "bar" in tab && tab.bar;
          return (
            <Tabs.Screen
              key={tab.name}
              name={tab.name}
              options={{
                title: t(tab.titleKey),
                href: inBar && canOpenTab(tab.name, permissions, modules) ? undefined : null,
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
