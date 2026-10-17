import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient } from "../../auth/client";
import { refreshSession } from "../../auth/session";
import { errorKey } from "../../errors";
import { Button } from "../../ui/Button";
import { Select } from "../../ui/Select";
import { Message } from "../../ui/Text";
import { TextField } from "../../ui/TextField";
import { saveCode, savedCode } from "./accessCode";

interface DemoAccount {
  email: string;
  name: string;
  role: string;
}

/**
 * Staging sandbox only (ADR 0018). The server answers 404 on prod, so nothing renders there.
 * Elsewhere nothing but a "I have a tester code" link shows: the account names appear only
 * after the server accepts the access code, and signing in as one needs the code again.
 */
export function DemoSwitch({ current }: { current?: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [code, setCode] = useState(savedCode);
  const [busy, setBusy] = useState(false);

  const status = useQuery({
    queryKey: ["demo", "status"],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error: failed } = await authClient.$fetch<{ enabled: boolean }>("/demo/status");
      if (failed || !data) throw new Error("demo mode off");
      return data.enabled;
    },
  });
  const accounts = useQuery({
    queryKey: ["demo", "accounts", code],
    enabled: status.isSuccess && !!code,
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error: failed } = await authClient.$fetch<{ accounts: DemoAccount[] }>(
        "/demo/accounts",
        { method: "POST", body: { code } },
      );
      if (failed || !data) {
        if (failed?.status === 403) {
          await saveCode(null); // rotated or wrong
          setCode(null);
        }
        throw failed ?? new Error("demo accounts unavailable");
      }
      return data.accounts;
    },
  });
  if (!status.isSuccess) return null;

  async function unlock() {
    setBusy(true);
    setError(null);
    const { error: failed } = await authClient.$fetch("/demo/accounts", {
      method: "POST",
      body: { code: draft.trim() },
    });
    setBusy(false);
    if (failed) return setError(errorKey(failed));
    await saveCode(draft.trim());
    setCode(draft.trim());
    setDraft("");
  }

  async function pick(email: string) {
    setError(null);
    const { error: failed } = await authClient.$fetch("/demo/sign-in", {
      method: "POST",
      body: { email, code },
    });
    if (failed) return setError(errorKey(failed));
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "demo" });
    await refreshSession(queryClient);
  }

  if (!accounts.data) {
    if (!typing) {
      return (
        <Button
          compact
          variant="ghost"
          label={t("demo.haveCode")}
          onPress={() => setTyping(true)}
        />
      );
    }
    return (
      <>
        <TextField
          label={t("demo.code")}
          value={draft}
          onChangeText={setDraft}
          autoCapitalize="none"
          secureTextEntry
        />
        {error ? <Message tone="error">{t(error)}</Message> : null}
        <Button
          label={t("demo.unlock")}
          variant="secondary"
          onPress={unlock}
          busy={busy}
          disabled={busy || draft.trim() === ""}
        />
      </>
    );
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
