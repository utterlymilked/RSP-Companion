import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../src/api";
import { useMe } from "../../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../../src/errors";
import { Button } from "../../../src/ui/Button";
import { Centered } from "../../../src/ui/Centered";
import { Choice } from "../../../src/ui/Choice";
import { ListItem } from "../../../src/ui/ListItem";
import { Screen } from "../../../src/ui/Screen";
import { Body, Message, Title } from "../../../src/ui/Text";
import { TextField } from "../../../src/ui/TextField";

const NONE = "none";

/**
 * Transport of one event: club vans (managers) and carpool offers (parents). Everyone called
 * up, or the guardian of someone called up, picks a seat; managers seat anyone. The driver's
 * phone only comes from the API for people who ride with them.
 */
export default function EventTransport() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const me = useMe().data;
  const manager = !!me?.permissions.includes("callups.write");
  const [seats, setSeats] = useState("4");
  const [pickupPoint, setPickupPoint] = useState("");
  const [label, setLabel] = useState("");

  const rides = useQuery({
    queryKey: ["transport", eventId],
    queryFn: async () =>
      jsonOrThrow(await api.transport.events[":eventId"].$get({ param: { eventId } })),
  });
  // Whom to seat: every person called up for managers, only one's own people otherwise.
  const people = useQuery({
    queryKey: ["transport-people", eventId, manager],
    queryFn: async () => {
      if (manager) {
        const body = await jsonOrThrow(
          await api.callups.events[":eventId"].$get({ param: { eventId } }),
        );
        return body.participants.map((p) => ({ personId: p.personId, name: p.name }));
      }
      const body = await jsonOrThrow(await api.callups.mine.$get());
      return body.callUps
        .filter((c) => c.eventId === eventId)
        .map((c) => ({ personId: c.personId, name: c.personName }));
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["transport", eventId] });
  const create = useMutation({
    mutationFn: async () =>
      jsonOrThrow(
        await api.transport.events[":eventId"].rides.$post({
          param: { eventId },
          json: {
            kind: manager ? "club_van" : "carpool",
            driverPersonId: manager ? null : (me?.personId ?? null),
            seats: Number(seats),
            label,
            pickupPoint,
          } as never,
        }),
      ),
    onSuccess: refresh,
  });
  const seat = useMutation({
    mutationFn: async (v: { personId: string; rideId: string }) => {
      const param = { rideId: v.rideId, personId: v.personId };
      const current = rides.data?.rides.find((r) =>
        r.passengers.some((p) => p.personId === v.personId),
      );
      if (v.rideId === NONE && current) {
        await api.transport.rides[":rideId"].passengers[":personId"].$delete({
          param: { rideId: current.id, personId: v.personId },
        });
        return;
      }
      if (v.rideId !== NONE) {
        await jsonOrThrow(
          await api.transport.rides[":rideId"].passengers[":personId"].$put({ param }),
        );
      }
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (rideId: string) =>
      api.transport.rides[":rideId"].$delete({ param: { rideId } }),
    onSuccess: refresh,
  });

  if (rides.isPending) return <Centered />;
  const list = rides.data?.rides ?? [];
  const canOffer = manager || !!me?.personId;
  const rideName = (r: (typeof list)[number], i: number) =>
    r.label ?? `${t(`transport.${r.kind}`)} ${i + 1}`;
  const seatable = list.filter((r) => manager || r.kind === "carpool");
  const mutationError = [create, seat, remove].find((m) => m.isError)?.error;
  return (
    <Screen>
      <Button label={t("common.back")} variant="secondary" onPress={() => router.back()} />
      <Title>{t("transport.title")}</Title>
      {rides.isError ? <Message tone="error">{t(errorKey(rides.error))}</Message> : null}
      {mutationError ? <Message tone="error">{t(errorKey(mutationError))}</Message> : null}
      {list.length === 0 ? <Body>{t("transport.empty")}</Body> : null}
      {list.map((r, i) => (
        <ListItem
          key={r.id}
          title={`${rideName(r, i)} · ${t("transport.seatsTaken", { taken: r.taken, seats: r.seats })}`}
          subtitle={[
            r.driverName ? `${t("transport.driver")}: ${r.driverName}` : null,
            r.driverPhone,
            r.pickupPoint ? `${t("transport.pickup")}: ${r.pickupPoint}` : null,
            ...r.passengers.map((p) => p.name),
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      ))}
      {seatable.length > 0
        ? (people.data ?? []).map((p) => (
            <Choice
              key={p.personId}
              label={t("transport.seatFor", { name: p.name })}
              value={
                list.find((r) => r.passengers.some((x) => x.personId === p.personId))?.id ?? NONE
              }
              onChange={(rideId) => seat.mutate({ personId: p.personId, rideId })}
              options={[
                { value: NONE, label: t("transport.noRide") },
                ...seatable.map((r) => ({ value: r.id, label: rideName(r, list.indexOf(r)) })),
              ]}
            />
          ))
        : null}
      {list
        .filter((r) => r.canManage)
        .map((r) => (
          <Button
            key={r.id}
            label={t("transport.remove", { name: rideName(r, list.indexOf(r)) })}
            variant="secondary"
            onPress={() => remove.mutate(r.id)}
          />
        ))}
      {canOffer ? (
        <>
          <Body muted>{manager ? t("transport.addVan") : t("transport.offer")}</Body>
          {manager ? (
            <TextField label={t("transport.label")} value={label} onChangeText={setLabel} />
          ) : null}
          <TextField
            label={t("transport.seats")}
            value={seats}
            onChangeText={setSeats}
            keyboardType="numeric"
          />
          <TextField
            label={t("transport.pickup")}
            value={pickupPoint}
            onChangeText={setPickupPoint}
          />
          <Button
            label={manager ? t("transport.addVan") : t("transport.offer")}
            busy={create.isPending}
            onPress={() => create.mutate()}
          />
        </>
      ) : null}
    </Screen>
  );
}
