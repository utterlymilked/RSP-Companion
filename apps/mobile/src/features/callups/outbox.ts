import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AttendanceStatus } from "@rsc/shared";

/** One attendance mark taken on this device; `markedAt` orders it against others on the server. */
export interface PendingMark {
  personId: string;
  status: AttendanceStatus | null;
  markedAt: string;
}

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const KEY = "rsc.attendance-outbox";
type Queue = Record<string, PendingMark[]>;

async function read(storage: KeyValueStorage): Promise<Queue> {
  try {
    const raw = await storage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Queue) : {};
  } catch {
    return {};
  }
}

const write = async (storage: KeyValueStorage, queue: Queue) => {
  try {
    await storage.setItem(KEY, JSON.stringify(queue));
  } catch {
    // Storage full or blocked: marks stay in memory on the screen and are sent when online.
  }
};

/** Marks of an event waiting to be sent (attendance works offline at the field). */
export async function pendingMarks(eventId: string, storage: KeyValueStorage = AsyncStorage) {
  return (await read(storage))[eventId] ?? [];
}

/** Queues a mark, replacing an earlier unsent one for the same person. */
export async function queueMark(
  eventId: string,
  mark: PendingMark,
  storage: KeyValueStorage = AsyncStorage,
) {
  const queue = await read(storage);
  queue[eventId] = [...(queue[eventId] ?? []).filter((m) => m.personId !== mark.personId), mark];
  await write(storage, queue);
  return queue[eventId];
}

/**
 * Sends the queued marks of an event. Marks taken while the request was in flight stay
 * queued; if `send` throws (offline, server error) everything stays for the next try.
 */
export async function flushMarks(
  eventId: string,
  send: (marks: PendingMark[]) => Promise<void>,
  storage: KeyValueStorage = AsyncStorage,
) {
  const sent = (await read(storage))[eventId] ?? [];
  if (sent.length === 0) return [];
  await send(sent);
  const queue = await read(storage);
  const left = (queue[eventId] ?? []).filter(
    (m) => !sent.some((s) => s.personId === m.personId && s.markedAt === m.markedAt),
  );
  if (left.length > 0) queue[eventId] = left;
  else delete queue[eventId];
  await write(storage, queue);
  return left;
}
