import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { BookingRow } from "../../src/features/bookings/BookingRow";
import type { BookingSummary } from "../../src/features/bookings/occupancy";
import { dayHeading, dayOf } from "../../src/features/bookings/time";
import { fontSize, spacing, useColors } from "../../src/theme";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { Screen } from "../../src/ui/Screen";
import { Segmented } from "../../src/ui/Segmented";
import { Body, Message, Title } from "../../src/ui/Text";

/** Statuses a booking can still be withdrawn from. */
const CANCELLABLE = ["to_confirm", "confirmed"];

/**
 * "Minhas reservas": the bookings the signed-in user made, upcoming first and then the past.
 * Tapping one opens it (where attendance can be recorded and the club office can change it);
 * upcoming ones can be cancelled here, after a second tap to confirm.
 */
export default function MyBookings() {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canWrite = !!useMe().data?.permissions.includes("bookings.write");
  const [when, setWhen] = useState<"upcoming" | "past">("upcoming");
  const [confirming, setConfirming] = useState<string | null>(null);

  const mine = useQuery({
    queryKey: ["bookings", "mine"],
    queryFn: async () => jsonOrThrow(await api.bookings.mine.$get()),
  });
  const cancel = useMutation({
    mutationFn: async (bookingId: string) =>
      jsonOrThrow(
        await api.bookings[":bookingId"].$patch({
          param: { bookingId },
          json: { status: "cancelled", applyTo: "one" } as never,
        }),
      ),
    onSuccess: async () => {
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });

  if (mine.isPending) return <Centered />;
  const items = ((when === "upcoming" ? mine.data?.upcoming : mine.data?.past) ??
    []) as unknown as BookingSummary[];
  const days = [...new Set(items.map((b) => dayOf(b.startsAt)))];
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("bookings.mine.title")}</Title>
      <Segmented
        label={t("bookings.mine.title")}
        value={when}
        onChange={setWhen}
        options={[
          { value: "upcoming", label: t("bookings.mine.upcoming") },
          { value: "past", label: t("bookings.mine.past") },
        ]}
      />
      {mine.isError ? <Message tone="error">{t(errorKey(mine.error))}</Message> : null}
      {cancel.isError ? <Message tone="error">{t(errorKey(cancel.error))}</Message> : null}
      {items.length === 0 && !mine.isError ? (
        <Body muted>
          {t(when === "upcoming" ? "bookings.mine.emptyUpcoming" : "bookings.mine.emptyPast")}
        </Body>
      ) : null}
      {days.map((day) => (
        <View key={day} style={styles.day}>
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.textMuted }]}>
            {dayHeading(day, i18n.language)}
          </Text>
          {items
            .filter((b) => dayOf(b.startsAt) === day)
            .map((b) => (
              <View key={b.id} style={styles.item}>
                <BookingRow
                  booking={b}
                  onPress={() =>
                    router.push({ pathname: "/booking/[bookingId]", params: { bookingId: b.id } })
                  }
                />
                {when === "upcoming" && canWrite && CANCELLABLE.includes(b.status) ? (
                  confirming === b.id ? (
                    <Button
                      compact
                      variant="secondary"
                      icon="close-circle-outline"
                      label={t("bookings.mine.confirmCancel")}
                      busy={cancel.isPending}
                      onPress={() => cancel.mutate(b.id)}
                    />
                  ) : (
                    <Button
                      compact
                      variant="secondary"
                      label={t("bookings.cancel")}
                      onPress={() => setConfirming(b.id)}
                    />
                  )
                ) : null}
              </View>
            ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  day: { gap: spacing.sm },
  heading: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  item: { gap: spacing.xs },
});
