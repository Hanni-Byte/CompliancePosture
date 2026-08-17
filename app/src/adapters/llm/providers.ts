/**
 * Provider registry — the single source of truth for which origins the app
 * may talk to. The build-time CSP generator (scripts/generate-csp.mjs) derives
 * `connect-src` from `cspOrigins`, so adding a provider here is what
 * authorizes it (§2.8). v0.2 adds OpenAI, Anthropic and custom URLs.
 */
export interface ProviderSpec {
  id: string;
  label: string;
  baseUrl: string;
  /** Origins added to the CSP connect-src allowlist. */
  cspOrigins: string[];
  requiresKey: boolean;
  defaultModel: string;
  /** Shown in the setup UI; keep copy-pasteable. */
  notes: string[];
}

export const PROVIDERS: readonly ProviderSpec[] = [
  {
    id: "mistral",
    label: "Mistral (EU)",
    baseUrl: "https://api.mistral.ai/v1",
    cspOrigins: ["https://api.mistral.ai"],
    requiresKey: true,
    defaultModel: "mistral-small-latest",
    notes: [
      "Create a key at console.mistral.ai — it is sent only from your browser to api.mistral.ai.",
    ],
  },
  {
    id: "ollama",
    label: "Ollama (local, offline)",
    baseUrl: "http://localhost:11434/v1",
    cspOrigins: ["http://localhost:11434", "http://127.0.0.1:11434"],
    requiresKey: false,
    defaultModel: "llama3.2",
    notes: [
      "Start Ollama so this site may call it: OLLAMA_ORIGINS=https://complianceposture.hannibyte.com ollama serve",
      "Safari may block HTTPS-page → localhost calls; Chrome and Firefox allow them.",
    ],
  },
] as const;

export function providerById(id: string): ProviderSpec | null {
  return PROVIDERS.find((p) => p.id === id) ?? null;
}