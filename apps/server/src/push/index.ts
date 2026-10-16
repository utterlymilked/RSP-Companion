export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** Ids only, never personal data (ADR 0004). */
  data: Record<string, string>;
}

/** Sends push notifications; returns the tokens the push service says are dead. */
export interface PushSender {
  send(messages: PushMessage[]): Promise<{ invalidTokens: string[] }>;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK = 100;

/** Expo's push service, which relays to APNs and FCM. */
export function createExpoPush(
  options: { accessToken?: string; fetchImpl?: typeof fetch } = {},
): PushSender {
  const doFetch = options.fetchImpl ?? fetch;
  return {
    async send(messages) {
      const invalidTokens: string[] = [];
      for (let i = 0; i < messages.length; i += CHUNK) {
        const chunk = messages.slice(i, i + CHUNK);
        const res = await doFetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
          },
          body: JSON.stringify(chunk.map((m) => ({ ...m, sound: "default" }))),
        });
        if (!res.ok) throw new Error(`Expo push failed: ${res.status}`);
        const { data } = (await res.json()) as {
          data?: { status: string; details?: { error?: string } }[];
        };
        data?.forEach((ticket, index) => {
          const message = chunk[index];
          if (
            message &&
            ticket.status === "error" &&
            ticket.details?.error === "DeviceNotRegistered"
          ) {
            invalidTokens.push(message.to);
          }
        });
      }
      return { invalidTokens };
    },
  };
}

/** Logs instead of sending (development without a push setup). */
export function consolePush(): PushSender {
  return {
    async send(messages) {
      for (const m of messages) console.log(`📲 push to ${m.to}: ${m.title}`);
      return { invalidTokens: [] };
    },
  };
}

/** Keeps messages in memory, for tests. Tokens listed in `dead` come back as invalid. */
export function memoryPush(): PushSender & { sent: PushMessage[]; dead: Set<string> } {
  const sent: PushMessage[] = [];
  const dead = new Set<string>();
  return {
    sent,
    dead,
    async send(messages) {
      sent.push(...messages);
      return { invalidTokens: messages.map((m) => m.to).filter((t) => dead.has(t)) };
    },
  };
}
