import { describe, expect, it } from "vitest";
import { InMemoryVault, SessionVault } from "./vaults";

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("InMemoryVault", () => {
  it("stores, retrieves, and wipes", () => {
    const vault = new InMemoryVault();
    expect(vault.custody).toBe("memory");
    expect(vault.retrieve()).toBeNull();
    vault.store("sk-1");
    expect(vault.retrieve()).toBe("sk-1");
    vault.wipe();
    expect(vault.retrieve()).toBeNull();
  });
});

describe("SessionVault", () => {
  it("stores in the injected session storage and wipes completely", () => {
    const storage = fakeStorage();
    const vault = new SessionVault(storage);
    expect(vault.custody).toBe("session");
    vault.store("sk-2");
    expect(vault.retrieve()).toBe("sk-2");
    vault.wipe();
    expect(vault.retrieve()).toBeNull();
    expect(storage.length).toBe(0);
  });
});