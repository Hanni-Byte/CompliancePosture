import type { ProviderSetupDeps } from "../../adapters/controllers/use-provider-setup";
import { SetupPanel } from "./SetupPanel";

export function App({ setupDeps }: { setupDeps: ProviderSetupDeps }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">CompliancePosture</h1>
        <p className="text-lg opacity-80">
          AI compliance assessment that runs entirely in your browser. Your
          data never leaves it.
        </p>
      </header>
      <SetupPanel deps={setupDeps} />
      <p className="text-sm opacity-60">
        Interview and assessment arrive per the roadmap in docs/HANDOFF.md.
      </p>
    </main>
  );
}