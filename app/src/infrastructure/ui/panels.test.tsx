// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchPanel } from "./SearchPanel";
import { SetupPanel, errorText } from "./SetupPanel";
import type { KnowledgePack } from "../../domain/entities/pack";
import type { RetrievalPort } from "../../application/ports/retrieval";
import { FakeLlmGateway } from "../../test/fakes/fake-llm-gateway";
import { FakeVault } from "../../test/fakes/fake-vault";
import { ok } from "../../application/result";

const pack: KnowledgePack = {
  manifest: { schemaVersion: 1, id: "eu_ai_act", framework: "EU_AI_ACT", name: "EU AI Act", version: "OJ 2024", sources: [], license: "© European Union — reuse authorised", chunkCount: 1, topicCount: 1, files: {} },
  chunks: [{ id: "art_26_1", ref: "Art. 26(1)", title: "Article 26", text: "Deployers shall…", url: "https://eur-lex.europa.eu/x#art_26" }],
  topics: [{ id: "t", title: "t", seedQueries: ["q"], dependsOnSlots: [] }],
};
const retrieval: RetrievalPort = {
  listPacks: () => Promise.resolve(ok([{ id: "eu_ai_act", framework: "EU_AI_ACT", name: "EU AI Act", version: "OJ 2024", license: pack.manifest.license, chunkCount: 1 }])),
  loadPack: () => Promise.resolve(ok(pack)),
  search: () => Promise.resolve(ok([{ chunk: pack.chunks[0]!, score: 1 }])),
};

describe("SearchPanel", () => {
  it("disables search until the pack is ready, then renders hits with primary-source links and attribution", async () => {
    render(<SearchPanel retrieval={retrieval} />);
    const input = screen.getByLabelText<HTMLInputElement>("Search query");
    expect(input.disabled).toBe(true);
    await waitFor(() => expect(input.disabled).toBe(false));
    expect(screen.getByTestId("pack-status").textContent).toContain("checksums verified");
    fireEvent.change(input, { target: { value: "deployers" } });
    fireEvent.submit(input.closest("form")!);
    const link = await screen.findByRole("link", { name: "Art. 26(1)" });
    expect(link).toHaveProperty("href", "https://eur-lex.europa.eu/x#art_26");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getByTestId("pack-attribution").textContent).toContain("© European Union");
  });
});

describe("SetupPanel", () => {
  it("hides the key input for providers that need no key and verifies", async () => {
    const gateway = new FakeLlmGateway();
    gateway.pingResults.push(ok({ providerId: "ollama", model: "llama3.2" }));
    render(<SetupPanel deps={{ makeVault: (c) => new FakeVault(c), makeGateway: () => gateway }} />);
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "ollama" } });
    expect(screen.queryByLabelText("API key")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect((await screen.findByRole("status")).textContent).toContain("Connected to ollama (llama3.2)");
  });

  it("shows the key input for Mistral and friendly copy for auth failures", () => {
    render(<SetupPanel deps={{ makeVault: (c) => new FakeVault(c), makeGateway: () => new FakeLlmGateway() }} />);
    expect(screen.getByLabelText("API key")).toBeTruthy();
    expect(errorText({ kind: "auth", message: "401" })).toMatch(/rejected this key/);
    expect(errorText({ kind: "rate_limit", message: "Rate limited", retryAfterSeconds: 7 })).toMatch(/7s/);
    expect(errorText({ kind: "storage", message: "no storage" })).toBe("no storage");
  });
});
