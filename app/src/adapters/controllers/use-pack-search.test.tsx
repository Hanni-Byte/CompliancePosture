// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePackSearch } from "./use-pack-search";
import type { KnowledgePack, PackSummary } from "../../domain/entities/pack";
import type { PackError, RetrievalPort } from "../../application/ports/retrieval";
import { err, ok } from "../../application/result";

function pack(id: string): KnowledgePack {
  return {
    manifest: { schemaVersion: 1, id, framework: "EU_AI_ACT", name: id, version: "v", sources: [], license: "l", chunkCount: 1, topicCount: 1, files: {} },
    chunks: [{ id: "c", ref: "Art. 1", title: "t", text: "x", url: "https://u" }],
    topics: [{ id: "t", title: "t", seedQueries: ["q"], dependsOnSlots: [] }],
  };
}

function fakeRetrieval(opts: { delay?: Record<string, number>; failLoad?: PackError; failSearch?: PackError } = {}): RetrievalPort {
  const summaries: PackSummary[] = [
    { id: "a", framework: "EU_AI_ACT", name: "Pack A", version: "v", license: "l", chunkCount: 1 },
    { id: "b", framework: "OWASP_LLM_TOP_10", name: "Pack B", version: "v", license: "l", chunkCount: 1 },
  ];
  return {
    listPacks: () => Promise.resolve(ok(summaries)),
    loadPack: (id) =>
      new Promise((resolve) => setTimeout(() => resolve(opts.failLoad ? err(opts.failLoad) : ok(pack(id))), opts.delay?.[id] ?? 0)),
    search: (id, query) =>
      Promise.resolve(opts.failSearch ? err(opts.failSearch) : ok([{ chunk: { ...pack(id).chunks[0]!, text: query }, score: 1 }])),
  };
}

describe("usePackSearch", () => {
  it("lists packs from the catalogue and loads the first one", async () => {
    // The port instance must be stable across renders (as it is in main.tsx).
    const retrieval = fakeRetrieval();
    const { result } = renderHook(() => usePackSearch(retrieval));
    await waitFor(() => expect(result.current.catalogue.map((p) => p.id)).toEqual(["a", "b"]));
    await waitFor(() => expect(result.current.status.phase).toBe("ready"));
    expect(result.current.packId).toBe("a");
  });

  it("ignores a stale load result after switching packs", async () => {
    const retrieval = fakeRetrieval({ delay: { a: 50, b: 0 } });
    const { result } = renderHook(() => usePackSearch(retrieval));
    await waitFor(() => expect(result.current.packId).toBe("a"));
    act(() => result.current.selectPack("b"));
    await waitFor(() => expect(result.current.status.phase).toBe("ready"));
    await new Promise((r) => setTimeout(r, 80)); // let the stale "a" load resolve
    expect(result.current.status.phase === "ready" && result.current.status.pack.manifest.id).toBe("b");
  });

  it("reports a load failure and a search failure separately, keeping the pack usable", async () => {
    const failingRetrieval = fakeRetrieval({ failLoad: { kind: "integrity", packId: "a", message: "bad" } });
    const failing = renderHook(() => usePackSearch(failingRetrieval));
    await waitFor(() => expect(failing.result.current.status.phase).toBe("failed"));

    const retrieval = fakeRetrieval({ failSearch: { kind: "network", packId: "a", message: "down" } });
    const { result } = renderHook(() => usePackSearch(retrieval));
    await waitFor(() => expect(result.current.status.phase).toBe("ready"));
    await act(() => result.current.search("q"));
    expect(result.current.searchError?.kind).toBe("network");
    expect(result.current.status.phase).toBe("ready");
  });

  it("clears hits and errors on an empty query", async () => {
    const retrieval = fakeRetrieval();
    const { result } = renderHook(() => usePackSearch(retrieval));
    await waitFor(() => expect(result.current.status.phase).toBe("ready"));
    await act(() => result.current.search("deployers"));
    expect(result.current.hits[0]?.chunk.text).toBe("deployers");
    await act(() => result.current.search("   "));
    expect(result.current.hits).toEqual([]);
  });
});
