// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useProviderSetup, type ProviderSetupDeps } from "./use-provider-setup";
import { FakeLlmGateway } from "../../test/fakes/fake-llm-gateway";
import { FakeVault } from "../../test/fakes/fake-vault";
import { err, ok } from "../../application/result";

function deps(setup: (gateway: FakeLlmGateway, vault: FakeVault) => void = () => {}) {
  const vaults: FakeVault[] = [];
  const d: ProviderSetupDeps = {
    makeVault: (custody) => {
      const v = new FakeVault(custody);
      vaults.push(v);
      return v;
    },
    makeGateway: (_spec, vault) => {
      const g = new FakeLlmGateway();
      setup(g, vault as FakeVault);
      return g;
    },
  };
  return { d, vaults };
}

describe("useProviderSetup", () => {
  it("verifies with the selected custody and reports the model", async () => {
    const { d, vaults } = deps((g) => g.pingResults.push(ok({ providerId: "mistral", model: "mistral-small-latest" })));
    const { result } = renderHook(() => useProviderSetup(d));
    act(() => result.current.selectCustody("session"));
    await act(() => result.current.verify("sk-1"));
    expect(result.current.status).toEqual({ phase: "verified", verification: { providerId: "mistral", model: "mistral-small-latest", custody: "session" } });
    expect(vaults[0]?.custody).toBe("session");
    expect(vaults[0]?.retrieve()).toBe("sk-1");
  });

  it("wipeKey wipes the vault created by verify and returns to idle", async () => {
    const { d, vaults } = deps((g) => g.pingResults.push(ok({ providerId: "mistral", model: "m" })));
    const { result } = renderHook(() => useProviderSetup(d));
    await act(() => result.current.verify("sk-1"));
    act(() => result.current.wipeKey());
    expect(vaults[0]?.wiped).toBe(1);
    expect(vaults[0]?.retrieve()).toBeNull();
    expect(result.current.status).toEqual({ phase: "idle" });
  });

  it("never reports verified for a vault that was wiped while verifying", async () => {
    let resolvePing: (() => void) | null = null;
    const { d } = deps((g) => {
      g.ping = () => new Promise((resolve) => { resolvePing = () => resolve(ok({ providerId: "mistral", model: "m" })); });
    });
    const { result } = renderHook(() => useProviderSetup(d));
    let pending!: Promise<void>;
    act(() => { pending = result.current.verify("sk-1"); });
    await waitFor(() => expect(result.current.status.phase).toBe("verifying"));
    act(() => result.current.wipeKey());
    await act(async () => { resolvePing?.(); await pending; });
    expect(result.current.status).toEqual({ phase: "idle" });
  });

  it("surfaces a storage failure as a failed status instead of hanging", async () => {
    const { d } = deps((_g, vault) => { vault.refuse = "Session storage is unavailable"; });
    const { result } = renderHook(() => useProviderSetup(d));
    await act(() => result.current.verify("sk-1"));
    expect(result.current.status).toEqual({ phase: "failed", error: { kind: "storage", message: "Session storage is unavailable" } });
  });

  it("maps an auth failure to failed and switching provider resets to idle", async () => {
    const { d } = deps((g) => g.pingResults.push(err({ kind: "auth", message: "401" })));
    const { result } = renderHook(() => useProviderSetup(d));
    await act(() => result.current.verify("bad"));
    expect(result.current.status.phase).toBe("failed");
    act(() => result.current.selectProvider("ollama"));
    expect(result.current.status).toEqual({ phase: "idle" });
    expect(result.current.provider?.id).toBe("ollama");
  });
});
