import type { RsvpStatus } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../api";
import { errorKey, jsonOrThrow } from "../../errors";
import { fontSize, radius, spacing, useColors } from "../../theme";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { DateBlock } from "../../ui/DateBlock";
import { Section } from "../../ui/Section";
import { Message } from "../../ui/Text";
import { clockTime, dayOf } from "../bookings/time";

/** Upcoming call-ups of the user and their wards, each with a going / not going answer. */
export function MyCallUps() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const colors = useColors();
  const queryClient = useQueryClient();
  const mine = useQuery({
    queryKey: ["callups", "mine"],
    queryFn: async () => jsonOrThrow(await api.callups.mine.$get()),
  });
  const answer = useMutation({
    mutationFn: async (v: { eventId: string; personId: string; rsvp: RsvpStatus }) =>
      jsonOrThrow(
        await api.callups.events[":eventId"].people[":personId"].rsvp.$put({
          param: { eventId: v.eventId, personId: v.personId },
          json: { rsvp: v.rsvp },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["callups", "mine"] }),
  });
  const callUps = mine.data?.callUps ?? [];
  if (callUps.length === 0) return null;
  return (
    <Section title={t("callups.mine")}>
      {callUps.map((c) => (
        <Card key={`${c.eventId}:${c.personId}`}>
          <View style={styles.row}>
            <DateBlock date={dayOf(c.startsAt)} locale={i18n.language} />
            <View style={styles.texts}>
              <Text style={[styles.title, { color: colors.text }]}>
                {c.title ?? t(`eventKinds.${c.kind}`)}
              </Text>
              <Text style={[styles.sub, { color: colors.textMuted }]}>
                {[c.personName, clockTime(c.startsAt), c.location].filter(Boolean).join(" · ")}
              </Text>
              {c.rsvp === "pending" ? <Badge label={t("rsvp.pending")} tone="warning" /> : null}
            </View>
          </View>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={`${c.personName} · ${t(`eventKinds.${c.kind}`)}`}
            style={styles.answers}
          >
            {(["going", "not_going"] as const).map((rsvp) => {
              const selected = c.rsvp === rsvp;
              const tint = rsvp === "going" ? colors.success : colors.danger;
              return (
                <Pressable
                  key={rsvp}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => answer.mutate({ eventId: c.eventId, personId: c.personId, rsvp })}
                  style={[
                    styles.answer,
                    {
                      borderColor: selected ? tint : colors.border,
                      backgroundColor: selected
                        ? rsvp === "going"
                          ? colors.successSoft
                          : colors.dangerSoft
                        : colors.surface,
                    },
                  ]}
                >
                  <Text style={[styles.answerText, { color: selected ? tint : colors.text }]}>
                    {t(`rsvp.${rsvp}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Button
            compact
            variant="tertiary"
            icon="bus-outline"
            label={t("transport.open")}
            onPress={() =>
              router.push({
                pathname: "/event/transport/[eventId]",
                params: { eventId: c.eventId },
              })
            }
          />
        </Card>
      ))}
      {answer.isError ? <Message tone="error">{t(errorKey(answer.error))}</Message> : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  texts: { flex: 1, gap: 3 },
  title: { fontSize: fontSize.md, fontWeight: "700" },
  sub: { fontSize: fontSize.sm },
  answers: { flexDirection: "row", gap: spacing.sm },
  answer: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1.5,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  answerText: { fontSize: fontSize.md, fontWeight: "700" },
});
