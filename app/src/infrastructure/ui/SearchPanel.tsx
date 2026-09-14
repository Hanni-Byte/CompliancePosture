import { useState } from "react";
import type { RetrievalPort } from "../../application/ports/retrieval";
import { usePackSearch } from "../../adapters/controllers/use-pack-search";

/**
 * Standalone privacy proof: the full text of the law is indexed and searched
 * inside this tab — no LLM, no request leaves the browser. Open DevTools →
 * Network and see for yourself.
 */
export function SearchPanel({ retrieval }: { retrieval: RetrievalPort }) {
  const panel = usePackSearch(retrieval);
  const [query, setQuery] = useState("");
  const ready = panel.status.phase === "ready";

  return (
    <section className="w-full max-w-lg space-y-4 rounded-xl border border-neutral-300 p-6 text-left dark:border-neutral-700">
      <h2 className="text-xl font-semibold">Search the law — locally</h2>
      <p className="text-sm opacity-70">
        The full text is downloaded once and indexed in this tab. Searching
        sends nothing anywhere — check the Network panel.
      </p>

      {panel.catalogueError ? (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          Pack catalogue unavailable ({panel.catalogueError.kind}): {panel.catalogueError.message}
        </p>
      ) : null}

      <label className="block text-sm font-medium">
        Framework
        <select
          className="mt-1 w-full rounded border border-neutral-300 bg-transparent p-2 dark:border-neutral-700"
          value={panel.packId}
          onChange={(e) => panel.selectPack(e.target.value)}
          disabled={panel.catalogue.length === 0}
        >
          {panel.catalogue.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {pack.name}
            </option>
          ))}
        </select>
      </label>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void panel.search(query);
        }}
      >
        <input
          className="flex-1 rounded border border-neutral-300 bg-transparent p-2 dark:border-neutral-700"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. obligations of deployers, human oversight, prompt injection"
          aria-label="Search query"
          disabled={!ready}
        />
        <button
          type="submit"
          className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          disabled={!ready}
        >
          Search
        </button>
      </form>

      {panel.status.phase === "loading" ? <p className="text-sm opacity-70">Loading and verifying pack…</p> : null}
      {panel.status.phase === "ready" ? (
        <p className="text-xs opacity-60" data-testid="pack-status">
          {panel.status.pack.manifest.name} · {panel.status.pack.manifest.version} · {panel.status.pack.chunks.length} passages,
          checksums verified
        </p>
      ) : null}
      {panel.status.phase === "failed" ? (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          Pack refused ({panel.status.error.kind}): {panel.status.error.message}
        </p>
      ) : null}
      {panel.searchError ? (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          Search failed ({panel.searchError.kind}): {panel.searchError.message}
        </p>
      ) : null}

      <ol className="space-y-3" aria-label="Search results">
        {panel.hits.map((hit) => (
          <li key={hit.chunk.id} className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            <div className="flex items-baseline justify-between gap-2">
              <a className="font-medium underline" href={hit.chunk.url} target="_blank" rel="noreferrer noopener">
                {hit.chunk.ref}
              </a>
              <span className="text-xs opacity-50">{hit.chunk.title}</span>
            </div>
            <p className="mt-1 line-clamp-4 opacity-80">{hit.chunk.text}</p>
          </li>
        ))}
      </ol>

      {panel.status.phase === "ready" ? (
        // Licence obligation (CC BY-SA 4.0 / EU reuse): attribution travels
        // with the content wherever it is shown.
        <p className="border-t border-neutral-200 pt-3 text-xs opacity-60 dark:border-neutral-800" data-testid="pack-attribution">
          Source: {panel.status.pack.manifest.license}
        </p>
      ) : null}
    </section>
  );
}
