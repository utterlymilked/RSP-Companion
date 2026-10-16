import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { jsonOrThrow } from "../../errors";
import { Select } from "../../ui/Select";

export interface PickedPerson {
  id: string;
  fullName: string;
}

/** Finds a person of the club registry by name (two letters or more) and picks one. */
export function PersonPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PickedPerson | null;
  onChange: (person: PickedPerson) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const q = search.trim();
  const people = useQuery({
    queryKey: ["people", q],
    enabled: q.length >= 2,
    queryFn: async () => jsonOrThrow(await api.people.$get({ query: { q } })),
  });
  const found = people.data?.people ?? [];
  return (
    <Select
      icon="person-outline"
      label={label}
      value={value?.id ?? null}
      onChange={(id) => {
        const person = found.find((p) => p.id === id);
        if (person) onChange({ id: person.id, fullName: person.fullName });
      }}
      onSearch={setSearch}
      loading={people.isFetching}
      emptyText={q.length < 2 ? t("users.person.searchHint") : undefined}
      options={[
        ...(value && !found.some((p) => p.id === value.id)
          ? [{ value: value.id, label: value.fullName }]
          : []),
        ...found.map((p) => ({ value: p.id, label: p.fullName, hint: p.displayName ?? undefined })),
      ]}
    />
  );
}
