import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";
import { useMe } from "../src/auth/session";
import { useBarPreference } from "../src/features/navigation/barPreference";
import { BAR_SLOTS, barChoices, barFor, TABS, type TabName } from "../src/navigation";
import { useColors } from "../src/theme";
import { BackBar } from "../src/ui/BackBar";
import { Button } from "../src/ui/Button";
import { ListGroup, ListRow } from "../src/ui/ListGroup";
import { Screen } from "../src/ui/Screen";
import { Section } from "../src/ui/Section";
import { MultiSelect } from "../src/ui/Select";
import { Body, Title } from "../src/ui/Text";

/** Lets each person choose which screens sit in the bottom bar and in what order (ADR 0029). */
export default function BarSettings() {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useColors();
  const me = useMe().data;
  const permissions = me?.permissions ?? [];
  const pref = useBarPreference(me?.user.id);
  const { bar, overflow, collector } = barFor(pref.saved, permissions, me?.modules);
  const chosen = [...bar.filter((n) => n !== "more"), ...overflow];
  const title = (name: string) => {
    const tab = TABS.find((x) => x.name === name);
    return t(tab?.titleKey ?? "tabs.more");
  };
  const options = barChoices(permissions, me?.modules).map((value) => ({
    value,
    label: title(value),
  }));
  const move = (i: number, by: -1 | 1) => {
    const next = [...chosen];
    const [item] = next.splice(i, 1);
    if (item) next.splice(i + by, 0, item);
    pref.set(next);
  };
  const arrow = (
    name: "arrow-up" | "arrow-down",
    label: string,
    enabled: boolean,
    go: () => void,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!enabled}
      onPress={go}
      hitSlop={6}
      style={{ padding: 8, opacity: enabled ? 1 : 0.3 }}
    >
      <Ionicons name={name} size={22} color={colors.primary} />
    </Pressable>
  );
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("bar.title")}</Title>
      <Body muted>{t("bar.hint", { slots: BAR_SLOTS })}</Body>
      <MultiSelect
        label={t("bar.items")}
        options={options}
        values={chosen as TabName[]}
        onChange={(picked) =>
          pref.set([
            ...chosen.filter((n) => picked.includes(n)),
            ...picked.filter((n) => !chosen.includes(n)),
          ])
        }
      />
      <Section title={t("bar.order")}>
        <ListGroup>
          {chosen.map((name, i) => (
            <ListRow
              key={name}
              title={title(name)}
              subtitle={collector && i >= BAR_SLOTS - 1 ? t("bar.inCollector") : undefined}
              icon={(TABS.find((x) => x.name === name)?.icon ?? "ellipse") as never}
              trailing={
                <>
                  {arrow("arrow-up", t("bar.up", { name: title(name) }), i > 0, () => move(i, -1))}
                  {arrow(
                    "arrow-down",
                    t("bar.down", { name: title(name) }),
                    i < chosen.length - 1,
                    () => move(i, 1),
                  )}
                </>
              }
            />
          ))}
          <ListRow
            title={collector ? t("tabs.collector") : t("tabs.more")}
            subtitle={t("bar.fixed")}
            icon="settings-outline"
          />
        </ListGroup>
      </Section>
      <Button variant="tertiary" label={t("bar.reset")} onPress={pref.reset} />
    </Screen>
  );
}
