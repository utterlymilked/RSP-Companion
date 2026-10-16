import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { clockTime, dayOf } from "../../src/features/bookings/time";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { Choice } from "../../src/ui/Choice";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

const KINDS = ["receipt", "loss", "sale", "adjustment"] as const;
type Kind = (typeof KINDS)[number];

/** One item: stock, movements (receipts, losses, sales, counts), loans to teams and returns. */
export default function EquipmentDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const canWrite = !!useMe().data?.permissions.includes("equipment.write");
  const [kind, setKind] = useState<Kind>("receipt");
  const [quantity, setQuantity] = useState("");
  const [loanTeam, setLoanTeam] = useState("");
  const [loanQuantity, setLoanQuantity] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const item = useQuery({
    queryKey: ["equipment-item", itemId],
    queryFn: async () =>
      jsonOrThrow(await api.equipment.items[":itemId"].$get({ param: { itemId } })),
  });
  const loans = useQuery({
    queryKey: ["equipment-loans", itemId],
    queryFn: async () =>
      jsonOrThrow(await api.equipment.loans.$get({ query: { itemId, open: "true" } })),
  });
  const teams = useQuery({
    queryKey: ["teams"],
    enabled: canWrite,
    queryFn: async () => jsonOrThrow(await api.teams.$get({ query: {} })),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["equipment"] });
    await queryClient.invalidateQueries({ queryKey: ["equipment-item", itemId] });
    await queryClient.invalidateQueries({ queryKey: ["equipment-loans", itemId] });
  };

  const amount = Number(quantity);
  const validAmount =
    Number.isInteger(amount) && amount !== 0 && (kind === "adjustment" || amount > 0);
  const move = useMutation({
    mutationFn: async () =>
      jsonOrThrow(
        await api.equipment.items[":itemId"].movements.$post({
          param: { itemId },
          json: { kind, quantity: amount } as never,
        }),
      ),
    onSuccess: async () => {
      setQuantity("");
      setSubmitted(false);
      await refresh();
    },
  });
  const loanAmount = Number(loanQuantity);
  const validLoan = Number.isInteger(loanAmount) && loanAmount > 0 && !!loanTeam;
  const lend = useMutation({
    mutationFn: async () =>
      jsonOrThrow(
        await api.equipment.loans.$post({
          json: { itemId, quantity: loanAmount, teamId: loanTeam } as never,
        }),
      ),
    onSuccess: async () => {
      setLoanQuantity("");
      await refresh();
    },
  });
  const giveBack = useMutation({
    mutationFn: async (loanId: string) =>
      jsonOrThrow(await api.equipment.loans[":loanId"].return.$post({ param: { loanId } })),
    onSuccess: refresh,
  });

  if (item.isPending) return <Centered />;
  const i = item.data?.item;
  const teamName = (id: string | null) => teams.data?.teams.find((x) => x.id === id)?.name ?? "";
  const error = item.error ?? move.error ?? lend.error ?? giveBack.error;
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      {error ? <Message tone="error">{t(errorKey(error))}</Message> : null}
      {i ? (
        <>
          <Title>{`${i.name}${i.size ? ` · ${i.size}` : ""}`}</Title>
          <ListItem
            title={t("equipment.stock", { count: i.stock })}
            subtitle={i.low ? t("equipment.low") : undefined}
          />
          {canWrite ? (
            <>
              <Choice
                label={t("equipment.kind")}
                value={kind}
                onChange={(v) => setKind(v as Kind)}
                options={KINDS.map((k) => ({ value: k, label: t(`stockKind.${k}`) }))}
              />
              <TextField
                label={t("equipment.quantity")}
                value={quantity}
                onChangeText={setQuantity}
              />
              {kind === "adjustment" ? <Body muted>{t("equipment.quantityHint")}</Body> : null}
              {submitted && !validAmount ? (
                <Message tone="error">{t("equipment.needQuantity")}</Message>
              ) : null}
              <Button
                label={t("equipment.record")}
                busy={move.isPending}
                onPress={() => {
                  setSubmitted(true);
                  if (validAmount) move.mutate();
                }}
              />
              <Title>{t("equipment.loanTitle")}</Title>
              <Choice
                label={t("equipment.loanTeam")}
                value={loanTeam}
                onChange={setLoanTeam}
                options={(teams.data?.teams ?? []).map((x) => ({ value: x.id, label: x.name }))}
              />
              <TextField
                label={t("equipment.loanQuantity")}
                value={loanQuantity}
                onChangeText={setLoanQuantity}
              />
              <Button
                label={t("equipment.lend")}
                variant="secondary"
                busy={lend.isPending}
                disabled={!validLoan}
                onPress={() => lend.mutate()}
              />
            </>
          ) : null}
          <Title>{t("equipment.openLoans")}</Title>
          {loans.data && loans.data.loans.length === 0 ? (
            <Body muted>{t("equipment.noLoans")}</Body>
          ) : null}
          {loans.data?.loans.map((l) => (
            <ListItem
              key={l.id}
              title={`${teamName(l.teamId)} · ${t("equipment.loanLine", { count: l.quantity })}`}
              subtitle={dayOf(l.loanedAt)}
              trailing={canWrite ? t("equipment.return") : undefined}
              onPress={canWrite ? () => giveBack.mutate(l.id) : undefined}
            />
          ))}
          <Title>{t("equipment.history")}</Title>
          {item.data?.movements.map((m) => (
            <ListItem
              key={m.id}
              title={`${t(`stockKind.${m.kind}`)} · ${m.delta > 0 ? "+" : ""}${m.delta}`}
              subtitle={`${dayOf(m.createdAt)} ${clockTime(m.createdAt)}`}
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}
