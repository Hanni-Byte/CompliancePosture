// L4 composition root — the only file allowed to know concrete classes
// (manual DI, no container).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import "./ui/styles.css";
import type { ProviderSetupDeps } from "../adapters/controllers/use-provider-setup";
import { OpenAiCompatibleGateway } from "../adapters/llm/openai-compatible";
import { InMemoryVault, SessionVault } from "../adapters/persistence/vaults";
import { PackLoader } from "../adapters/retrieval/pack-loader";

const setupDeps: ProviderSetupDeps = {
  makeVault: (custody) =>
    custody === "session" ? new SessionVault() : new InMemoryVault(),
  makeGateway: (spec, vault) => new OpenAiCompatibleGateway({ spec, vault }),
};

// Packs are served same-origin from /packs/ and fetched on demand (§7 L4);
// which packs exist comes from /packs/index.json, emitted by the pipeline.
const retrieval = new PackLoader({ baseUrl: "/packs" });

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("index.html is missing #root");
}

createRoot(rootElement, {
  onUncaughtError: (error) => {
    // No telemetry by constitution (§10); the boundary shows the user what to do.
    console.error("uncaught render error", error);
  },
}).render(
  <StrictMode>
    <ErrorBoundary>
      <App setupDeps={setupDeps} retrieval={retrieval} />
    </ErrorBoundary>
  </StrictMode>,
);
