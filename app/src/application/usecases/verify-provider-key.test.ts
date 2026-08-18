import { describe, expect, it } from "vitest";
import { verifyProviderKey } from "./verify-provider-key";
import { FakeLlmGateway } from "../../test/fakes/fake-llm-gateway";
import { FakeVault } from "../../test/fakes/fake-vault";
import { err, ok } from "../result";

describe("verifyProviderKey", () => {
  it("stores the trimmed key, pings, and reports provider + custody", async () => {
    const gateway = new FakeLlmGateway();
    gateway.pingResults.push(ok({ providerId: "mistral", model: "mistral-small" }));
    const vault = new FakeVault("memory");

    const result = await verifyProviderKey({ gateway, vault }, { apiKey: "  sk-test  " });

    expect(result).toEqual(
      ok({ providerId: "mistral", model: "mistral-small", custody: "memory" }),
    );
    expect(vault.retrieve()).toBe("sk-test");
  });

  it("wipes the key when the ping is rejected as auth failure", async () => {
    const gateway = new FakeLlmGateway();
    gateway.pingResults.push(err({ kind: "auth", message: "401" }));
    const vault = new FakeVault();

    const result = await verifyProviderKey({ gateway, vault }, { apiKey: "bad" });

    expect(result).toEqual(err({ kind: "auth", message: "401" }));
    expect(vault.retrieve()).toBeNull();
    expect(vault.wiped).toBe(1);
  });

  it("propagates cors and network classifications untouched", async () => {
    for (const kind of ["cors", "network"] as const) {
      const gateway = new FakeLlmGateway();
      gateway.pingResults.push(err({ kind, message: kind }));
      const vault = new FakeVault();
      const result = await verifyProviderKey({ gateway, vault }, { apiKey: "k" });
      expect(result).toEqual(err({ kind, message: kind }));
      expect(vault.retrieve()).toBeNull();
    }
  });

  it("accepts an empty key (Ollama needs none)", async () => {
    const gateway = new FakeLlmGateway();
    gateway.pingResults.push(ok({ providerId: "ollama", model: "llama3.2" }));
    const vault = new FakeVault("memory");

    const result = await verifyProviderKey({ gateway, vault }, { apiKey: "" });

    expect(result.ok).toBe(true);
    expect(vault.retrieve()).toBe("");
  });
});