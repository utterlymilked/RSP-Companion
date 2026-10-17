import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient } from "../../auth/client";
import { refreshSession } from "../../auth/session";
import { errorKey } from "../../errors";
import { Select } from "../../ui/Select";
import { Message } from "../../ui/Text";

interface DemoAccount {
  email: string;
  name: string;
  role: string;
}

/**
 * Staging sandbox only (ADR 0018): a combo box of the fake demo accounts that signs in as the
 * chosen one without a password. The server answers 404 on prod, so nothing renders there.
 */
export function DemoSwitch({ current }: { current?: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const accounts = useQuery({
    queryKey: ["demo", "accounts"],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error: failed } = await authClient.$fetch<{ accounts: DemoAccount[] }>(
        "/demo/accounts",
      );
      if (failed || !data) throw new Error("demo mode off");
      return data.accounts;
    },
  });
  if (!accounts.data) return null;

  async function pick(email: string) {
    setError(null);
    const { error: failed } = await authClient.$fetch("/demo/sign-in", {
      method: "POST",
      body: { email },
    });
    if (failed) return setError(errorKey(failed));
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "demo" });
    await refreshSession(queryClient);
  }

  return (
    <>
      <Select
        label={t("demo.switch")}
        placeholder={t("demo.pick")}
        value={accounts.data.find((a) => a.email === current)?.email ?? null}
        options={accounts.data.map((a) => ({ value: a.email, label: a.name, hint: a.email }))}
        onChange={pick}
      />
      {error ? <Message tone="error">{t(error)}</Message> : null}
    </>
  );
}
