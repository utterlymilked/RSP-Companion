import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useMe } from "../../src/auth/session";
import { canOpenTab, TABS } from "../../src/navigation";
import { useColors } from "../../src/theme";

/** Signed-in area: bottom tabs, filtered by the user's permissions. */
export default function AppLayout() {
  const { t } = useTranslation();
  const colors = useColors();
  const permissions = useMe().data?.permissions ?? [];
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarStyle: { backgroundColor: colors.surface },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.titleKey),
            href: canOpenTab(tab.name, permissions) ? undefined : null,
            tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} color={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
