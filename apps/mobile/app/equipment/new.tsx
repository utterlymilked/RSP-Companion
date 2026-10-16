import { createEquipmentItemSchema, EQUIPMENT_CATEGORIES } from "@rsc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Choice } from "../../src/ui/Choice";
import { Screen } from "../../src/ui/Screen";
import { Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

/** Adds an economato item (one per size). */
export default function NewEquipmentItem() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", category: "other", size: "", price: "", min: "0" });
  const [submitted, setSubmitted] = useState(false);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const euros =
    form.price.trim() === "" ? null : Math.round(Number(form.price.replace(",", ".")) * 100);
  const parsed = createEquipmentItemSchema.safeParse({
    name: form.name,
    category: form.category,
    size: form.size,
    priceCents: euros !== null && Number.isFinite(euros) ? euros : null,
    minStock: Number(form.min || 0),
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error("invalid");
      return jsonOrThrow(await api.equipment.items.$post({ json: parsed.data as never }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment"] });
      router.back();
    },
  });

  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("equipment.new")}</Title>
      <TextField label={t("equipment.name")} value={form.name} onChangeText={set("name")} />
      <Choice
        label={t("equipment.category")}
        value={form.category}
        onChange={set("category")}
        options={EQUIPMENT_CATEGORIES.map((v) => ({
          value: v,
          label: t(`equipmentCategory.${v}`),
        }))}
      />
      <TextField label={t("equipment.size")} value={form.size} onChangeText={set("size")} />
      <TextField label={t("equipment.price")} value={form.price} onChangeText={set("price")} />
      <TextField label={t("equipment.minStock")} value={form.min} onChangeText={set("min")} />
      {submitted && !parsed.success ? (
        <Message tone="error">{t("equipment.needName")}</Message>
      ) : null}
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
