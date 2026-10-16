import { flushMarks, type KeyValueStorage, pendingMarks, queueMark } from "./outbox";

const memory = (): KeyValueStorage => {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
  };
};
const P1 = "11111111-1111-4111-8111-111111111111";
const mark = (status: "present" | "absent", markedAt: string) => ({
  personId: P1,
  status,
  markedAt,
});

it("keeps the newest unsent mark per person", async () => {
  const s = memory();
  await queueMark("e1", mark("present", "2026-11-02T18:00:00Z"), s);
  await queueMark("e1", mark("absent", "2026-11-02T18:05:00Z"), s);
  expect(await pendingMarks("e1", s)).toEqual([mark("absent", "2026-11-02T18:05:00Z")]);
  expect(await pendingMarks("e2", s)).toEqual([]);
});

it("empties the queue after a send and keeps it when the send fails", async () => {
  const s = memory();
  await queueMark("e1", mark("present", "2026-11-02T18:00:00Z"), s);
  await expect(flushMarks("e1", () => Promise.reject(new Error("offline")), s)).rejects.toThrow(
    "offline",
  );
  expect(await pendingMarks("e1", s)).toHaveLength(1);
  const send = jest.fn().mockResolvedValue(undefined);
  expect(await flushMarks("e1", send, s)).toEqual([]);
  expect(send).toHaveBeenCalledWith([mark("present", "2026-11-02T18:00:00Z")]);
  expect(await pendingMarks("e1", s)).toEqual([]);
});

it("keeps a mark taken while the request was in flight", async () => {
  const s = memory();
  await queueMark("e1", mark("present", "2026-11-02T18:00:00Z"), s);
  const left = await flushMarks(
    "e1",
    async () => void (await queueMark("e1", mark("absent", "2026-11-02T18:06:00Z"), s)),
    s,
  );
  expect(left).toEqual([mark("absent", "2026-11-02T18:06:00Z")]);
});
