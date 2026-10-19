import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { jsonOrThrow } from "../../errors";
import { Select, type SelectOption } from "../../ui/Select";

interface Props {
  label: string;
  /** The club's name; free text, so a club that isn't listed can be typed. */
  value: string;
  onChange: (name: string) => void;
}

/**
 * Picks the club a player plays for from the public list (Wikidata) and the clubs added
 * before, searching as the user types. A name that isn't listed can be used as typed; the
 * server remembers it for next time.
 */
export function ClubSelect({ label, value, onChange }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const q = text.trim();
  const found = useQuery({
    queryKey: ["clubs", q],
    queryFn: async () => jsonOrThrow(await api.clubs.$get({ query: q ? { q } : {} })),
    placeholderData: (previous) => previous,
  });
  const options: SelectOption[] = (found.data?.clubs ?? []).map((c) => ({
    value: c.name,
    label: c.name,
    hint: c.city ?? undefined,
  }));
  const has = (name: string) => options.some((o) => o.value.toLowerCase() === name.toLowerCase());
  if (value && !has(value)) options.unshift({ value, label: value });
  if (q.length >= 2 && !has(q)) {
    options.push({ value: q, label: t("scoutingModel.ui.useClub", { name: q }) });
  }
  return (
    <Select
      label={label}
      value={value || null}
      onChange={onChange}
      options={options}
      onSearch={setText}
      loading={found.isFetching}
      placeholder={t("scoutingModel.ui.clubPlaceholder")}
      emptyText={t("scoutingModel.ui.clubEmpty")}
    />
  );
}
