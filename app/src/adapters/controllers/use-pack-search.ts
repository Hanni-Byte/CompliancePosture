import { useCallback, useEffect, useRef, useState } from "react";
import type { KnowledgePack, PackSummary } from "../../domain/entities/pack";
import type { PackError, RetrievalPort, RetrievedChunk } from "../../application/ports/retrieval";

export type SearchStatus =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; pack: KnowledgePack }
  | { phase: "failed"; error: PackError };

/**
 * Driving adapter for the "search the law locally" panel. State bookkeeping
 * and delegation only — retrieval logic lives behind the port. The pack list
 * comes from the pipeline-emitted catalogue, never from app code.
 */
export function usePackSearch(retrieval: RetrievalPort) {
  const [catalogue, setCatalogue] = useState<PackSummary[]>([]);
  const [catalogueError, setCatalogueError] = useState<PackError | null>(null);
  const [packId, setPackId] = useState<string>("");
  const [status, setStatus] = useState<SearchStatus>({ phase: "idle" });
  const [hits, setHits] = useState<RetrievedChunk[]>([]);
  const [searchError, setSearchError] = useState<PackError | null>(null);
  const latestLoadTicket = useRef(0);

  useEffect(() => {
    let cancelled = false;
    retrieval
      .listPacks()
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setCatalogue(result.value);
          setPackId((current) => current || (result.value[0]?.id ?? ""));
        } else {
          setCatalogueError(result.error);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setCatalogueError({ kind: "network", packId: "index", message: String(cause) });
      });
    return () => {
      cancelled = true;
    };
  }, [retrieval]);

  useEffect(() => {
    if (!packId) return;
    const ticket = ++latestLoadTicket.current;
    setStatus({ phase: "loading" });
    setHits([]);
    setSearchError(null);
    retrieval
      .loadPack(packId)
      .then((result) => {
        if (ticket !== latestLoadTicket.current) return;
        setStatus(result.ok ? { phase: "ready", pack: result.value } : { phase: "failed", error: result.error });
      })
      // The port never rejects; this guard keeps a future implementation from
      // pinning the panel on "loading" forever.
      .catch((cause: unknown) => {
        if (ticket === latestLoadTicket.current) {
          setStatus({ phase: "failed", error: { kind: "network", packId, message: String(cause) } });
        }
      });
  }, [retrieval, packId]);

  const search = useCallback(
    async (query: string, k = 8) => {
      if (!packId || query.trim() === "") {
        setHits([]);
        setSearchError(null);
        return;
      }
      const result = await retrieval.search(packId, query, k);
      if (result.ok) {
        setHits(result.value);
        setSearchError(null);
      } else {
        setSearchError(result.error);
      }
    },
    [retrieval, packId],
  );

  return { catalogue, catalogueError, packId, selectPack: setPackId, status, hits, searchError, search };
}
