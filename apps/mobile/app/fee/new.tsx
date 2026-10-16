import { createChargeSchema, FEE_KINDS } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { parseEuros } from "../../src/features/fees/money";
import { Button } from "../../src/ui/Button";
import { Choice } from "../../src/ui/Choice";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

/** New charge for one person, found by name. */
export default function NewCharge() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState<{ id: string; fullName: string } | null>(null);
  const [form, setForm] = useState({
    kind: "monthly",
    description: "",
    amount: "",
    discount: "",
    dueDate: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const people = useQuery({
    queryKey: ["people", search],
    enabled: !person && search.trim().length >= 2,
    queryFn: async () => jsonOrThrow(await api.people.$get({ query: { q: search.trim() } })),
  });

  const parsed = createChargeSchema.safeParse({
    personId: person?.id,
    kind: form.kind,
    description: form.description,
    amountCents: parseEuros(form.amount) ?? 0,
    discountCents: form.discount.trim() === "" ? 0 : (parseEuros(form.discount) ?? -1),
    dueDate: form.dueDate,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error("invalid");
      return jsonOrThrow(await api.fees.charges.$post({ json: parsed.data as never }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fees"] });
      router.back();
    },
  });

  return (
    <Screen>
      <Button label={t("common.back")} variant="secondary" onPress={() => router.back()} />
      <Title>{t("fees.new")}</Title>
      {person ? (
        <ListItem
          title={person.fullName}
          trailing={t("fees.change")}
          onPress={() => setPerson(null)}
        />
      ) : (
        <>
          <TextField label={t("fees.person")} value={search} onChangeText={setSearch} />
          {people.data?.people.map((p) => (
            <ListItem
              key={p.id}
              title={p.fullName}
              onPress={() => setPerson({ id: p.id, fullName: p.fullName })}
            />
          ))}
        </>
      )}
      <Choice
        label={t("fees.kind")}
        value={form.kind}
        onChange={set("kind")}
        options={FEE_KINDS.map((k) => ({ value: k, label: t(`feeKind.${k}`) }))}
      />
      <TextField
        label={t("fees.description")}
        value={form.description}
        onChangeText={set("description")}
      />
      <TextField label={t("fees.amount")} value={form.amount} onChangeText={set("amount")} />
      <TextField label={t("fees.discount")} value={form.discount} onChangeText={set("discount")} />
      <TextField label={t("fees.dueDate")} value={form.dueDate} onChangeText={set("dueDate")} />
      {submitted && !parsed.success ? <Message tone="error">{t("fees.needFields")}</Message> : null}
      {create.isError ? <Message tone="error">{t(errorKey(create.error))}</Message> : null}
      <Button
        label={t("common.save")}
        busy={create.isPending}
        onPress={() => {
          setSubmitted(true);
          if (parsed.success) create.mutate();
        }}
      />
    </Screen>
  );
}
