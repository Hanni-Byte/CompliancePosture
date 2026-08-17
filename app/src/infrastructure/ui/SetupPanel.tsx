import { useState } from "react";
import type { LlmError } from "../../application/ports/llm-gateway";
import {
  useProviderSetup,
  type ProviderSetupDeps,
} from "../../adapters/controllers/use-provider-setup";

function errorText(error: LlmError): string {
  switch (error.kind) {
    case "auth":
      return "The provider rejected this key. Check it and try again.";
    case "cors":
    case "network":
    case "rate_limit":
    case "invalid_response":
    case "provider_error":
    case "aborted":
      return error.message;
  }
}

export function SetupPanel({ deps }: { deps: ProviderSetupDeps }) {
  const setup = useProviderSetup(deps);
  const [apiKey, setApiKey] = useState("");

  return (
    <section className="w-full max-w-lg space-y-4 rounded-xl border border-neutral-300 p-6 text-left dark:border-neutral-700">
      <h2 className="text-xl font-semibold">Connect your AI provider</h2>
      <p className="text-sm opacity-70">
        Bring your own key. It stays in this browser and is sent only to the
        provider you choose — never to us.
      </p>

      <label className="block text-sm font-medium">
        Provider
        <select
          className="mt-1 w-full rounded border border-neutral-300 bg-transparent p-2 dark:border-neutral-700"
          value={setup.provider?.id ?? ""}
          onChange={(e) => setup.selectProvider(e.target.value)}
        >
          {setup.providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {setup.provider?.requiresKey ? (
        <label className="block text-sm font-medium">
          API key
          <input
            type="password"
            className="mt-1 w-full rounded border border-neutral-300 bg-transparent p-2 dark:border-neutral-700"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            autoComplete="off"
          />
        </label>
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={setup.custody === "session"}
          onChange={(e) =>
            setup.selectCustody(e.target.checked ? "session" : "memory")
          }
        />
        Keep the key for this tab session (survives reload, never written to
        disk)
      </label>

      {setup.provider ? (
        <ul className="list-disc space-y-1 pl-5 text-xs opacity-70">
          {setup.provider.notes.map((note) => (
            <li key={note}>
              <code className="break-all">{note}</code>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          disabled={setup.status.phase === "verifying"}
          onClick={() => void setup.verify(apiKey)}
        >
          {setup.status.phase === "verifying" ? "Verifying…" : "Verify"}
        </button>
        <button
          type="button"
          className="rounded border border-neutral-300 px-4 py-2 dark:border-neutral-700"
          onClick={() => {
            setup.wipeKey();
            setApiKey("");
          }}
        >
          Wipe key
        </button>
      </div>

      {setup.status.phase === "verified" ? (
        <p className="text-sm text-green-700 dark:text-green-400">
          Connected to {setup.status.verification.providerId} (
          {setup.status.verification.model}), key held in{" "}
          {setup.status.verification.custody === "memory"
            ? "memory only"
            : "this tab's session"}
          .
        </p>
      ) : null}
      {setup.status.phase === "failed" ? (
        <p className="text-sm text-red-700 dark:text-red-400">
          {errorText(setup.status.error)}
        </p>
      ) : null}
    </section>
  );
}