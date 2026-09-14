import type { ProviderSetupDeps } from "../../adapters/controllers/use-provider-setup";
import type { RetrievalPort } from "../../application/ports/retrieval";
import { SearchPanel } from "./SearchPanel";
import { SetupPanel } from "./SetupPanel";

export interface AppDeps {
  setupDeps: ProviderSetupDeps;
  retrieval: RetrievalPort;
}

export function App({ setupDeps, retrieval }: AppDeps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">CompliancePosture</h1>
        <p className="text-lg opacity-80">
          AI compliance assessment that runs entirely in your browser. Your
          data never leaves it.
        </p>
      </header>
      <SearchPanel retrieval={retrieval} />
      <SetupPanel deps={setupDeps} />
      <p className="text-sm opacity-60">
        Interview and assessment arrive per the roadmap in docs/HANDOFF.md.
      </p>
    </main>
  );
}
