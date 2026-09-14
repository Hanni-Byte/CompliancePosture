import { Component, type ReactNode } from "react";

interface State {
  failed: boolean;
}

/**
 * Last line of defence for render-time throws: a white screen would hide the
 * one thing users need to know — nothing of theirs left the browser.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mx-auto max-w-lg p-8 text-center" role="alert">
        <h1 className="text-2xl font-semibold">Something went wrong in this tab</h1>
        <p className="mt-3 opacity-80">
          Reload the page to continue. Nothing you entered left your browser —
          there is no server to have received it.
        </p>
        <button
          type="button"
          className="mt-6 rounded bg-neutral-900 px-4 py-2 text-white dark:bg-neutral-100 dark:text-neutral-900"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </main>
    );
  }
}
