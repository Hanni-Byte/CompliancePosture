// L4 composition root — the only file allowed to know concrete classes
// (manual DI, no container).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import "./ui/styles.css";
import type { ProviderSetupDeps } from "../adapters/controllers/use-provider-setup";
import { OpenAiCompatibleGateway } from "../adapters/llm/openai-compatible";
import { InMemoryVault, SessionVault } from "../adapters/persistence/vaults";

const setupDeps: ProviderSetupDeps = {
  makeVault: (custody) =>
    custody === "session" ? new SessionVault() : new InMemoryVault(),
  makeGateway: (spec, vault) => new OpenAiCompatibleGateway({ spec, vault }),
};

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("index.html is missing #root");
}

createRoot(rootElement).render(
  <StrictMode>
    <App setupDeps={setupDeps} />
  </StrictMode>,
);