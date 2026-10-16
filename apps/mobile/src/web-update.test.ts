import { act, renderHook } from "@testing-library/react-native";
import { isNewRelease, useReloadOnNewRelease } from "./web-update";

jest.mock("./auth/client", () => ({ isWeb: true, API_ORIGIN: "https://rsc.example" }));

it("reloads only for a different, real release", () => {
  expect(isNewRelease("sha-aaa", "sha-bbb")).toBe(true);
  expect(isNewRelease("sha-aaa", "sha-aaa")).toBe(false);
  expect(isNewRelease("dev", "sha-bbb")).toBe(false);
  expect(isNewRelease("sha-aaa", "dev")).toBe(false);
  expect(isNewRelease("sha-aaa", undefined)).toBe(false);
});

describe("useReloadOnNewRelease", () => {
  const reload = jest.fn();
  const store = new Map<string, string>();
  let page = new EventTarget();
  const g = globalThis as Record<string, unknown>;
  const saved = { document: g.document, window: g.window, sessionStorage: g.sessionStorage };

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-10-16T10:00:00Z") });
    reload.mockClear();
    store.clear();
    page = Object.assign(new EventTarget(), { visibilityState: "visible" });
    g.document = page;
    g.window = Object.assign(new EventTarget(), { location: { reload } });
    g.sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    };
    global.fetch = jest.fn(async () => ({
      json: async () => ({ status: "ok", version: "sha-new" }),
    })) as unknown as typeof fetch;
  });
  afterEach(() => {
    jest.useRealTimers();
    Object.assign(g, saved);
  });

  const showTab = async () => {
    await act(async () => {
      page.dispatchEvent(new Event("visibilitychange"));
    });
  };

  it("reloads once when the tab comes back after a deploy", async () => {
    const { unmount } = await renderHook(() => useReloadOnNewRelease("sha-old"));
    // Right after load the page is fresh: no check yet.
    await showTab();
    expect(global.fetch).not.toHaveBeenCalled();

    jest.advanceTimersByTime(61_000);
    await showTab();
    expect(global.fetch).toHaveBeenCalledWith("https://rsc.example/api/health", {
      cache: "no-store",
    });
    expect(reload).toHaveBeenCalledTimes(1);

    // If the reload still served the old bundle, do not loop.
    jest.advanceTimersByTime(61_000);
    await showTab();
    expect(reload).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it("stays put when the release has not changed", async () => {
    const { unmount } = await renderHook(() => useReloadOnNewRelease("sha-new"));
    jest.advanceTimersByTime(61_000);
    await showTab();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    await unmount();
  });
});
