import { PAYMENT_METHODS } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { formatEuros, parseEuros } from "../../src/features/fees/money";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { Choice } from "../../src/ui/Choice";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

/** One charge: what is owed, the payments with their receipt numbers, a new payment, cancel. */
export default function ChargeDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { chargeId } = useLocalSearchParams<{ chargeId: string }>();
  const canWrite = !!useMe().data?.permissions.includes("fees.write");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>("cash");
  const [submitted, setSubmitted] = useState(false);

  const detail = useQuery({
    queryKey: ["fee", chargeId],
    queryFn: async () =>
      jsonOrThrow(await api.fees.charges[":chargeId"].$get({ param: { chargeId } })),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["fees"] });
    await queryClient.invalidateQueries({ queryKey: ["fee", chargeId] });
  };

  const cents = parseEuros(amount);
  const pay = useMutation({
    mutationFn: async () =>
      jsonOrThrow(
        await api.fees.charges[":chargeId"].payments.$post({
          param: { chargeId },
          json: { amountCents: cents ?? 0, method } as never,
        }),
      ),
    onSuccess: async () => {
      setAmount("");
      setSubmitted(false);
      await refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: async () =>
      jsonOrThrow(
        await api.fees.charges[":chargeId"].cancel.$post({
          param: { chargeId },
          json: {} as never,
        }),
      ),
    onSuccess: refresh,
  });

  if (detail.isPending) return <Centered />;
  const c = detail.data?.charge;
  const error = detail.error ?? pay.error ?? cancel.error;
  const canPay = canWrite && c && c.status !== "paid" && c.status !== "cancelled";
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      {error ? <Message tone="error">{t(errorKey(error))}</Message> : null}
      {c ? (
        <>
          <Title>{`${c.personName} · ${c.description}`}</Title>
          <ListItem
            title={`${t(`feeStatus.${c.status}`)} · ${c.dueDate}`}
            subtitle={t("fees.paidOf", {
              paid: formatEuros(c.paidCents),
              total: formatEuros(c.netCents),
            })}
            trailing={formatEuros(c.balanceCents)}
          />
          <Title>{t("fees.payments")}</Title>
          {detail.data?.payments.length === 0 ? <Body muted>{t("fees.noPayments")}</Body> : null}
          {detail.data?.payments.map((p) => (
            <ListItem
              key={p.id}
              title={`${t("fees.receipt")} ${p.receiptNumber} · ${t(`paymentMethod.${p.method}`)}`}
              subtitle={p.paidOn}
              trailing={formatEuros(p.amountCents)}
            />
          ))}
          {canPay ? (
            <>
              <TextField label={t("fees.payAmount")} value={amount} onChangeText={setAmount} />
              <Choice
                label={t("fees.method")}
                value={method}
                onChange={(v) => setMethod(v as (typeof PAYMENT_METHODS)[number])}
                options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`paymentMethod.${m}`) }))}
              />
              {submitted && (!cents || cents <= 0) ? (
                <Message tone="error">{t("fees.needAmount")}</Message>
              ) : null}
              <Button
                label={t("fees.registerPayment")}
                busy={pay.isPending}
                onPress={() => {
                  setSubmitted(true);
                  if (cents && cents > 0) pay.mutate();
                }}
              />
              <Button
                label={t("fees.cancelCharge")}
                variant="secondary"
                busy={cancel.isPending}
                onPress={() => cancel.mutate()}
              />
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
