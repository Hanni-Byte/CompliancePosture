import { useCallback, useMemo, useRef, useState } from "react";
import type { LlmError, LlmGateway } from "../../application/ports/llm-gateway";
import type { KeyCustody, VaultPort } from "../../application/ports/vault";
import {
  verifyProviderKey,
  type KeyVerification,
} from "../../application/usecases/verify-provider-key";
import { PROVIDERS, providerById, type ProviderSpec } from "../llm/providers";

/** Injected by main.tsx (L4) — the hook never news up concrete classes. */
export interface ProviderSetupDeps {
  makeVault(custody: KeyCustody): VaultPort;
  makeGateway(spec: ProviderSpec, vault: VaultPort): LlmGateway;
}

export type SetupStatus =
  | { phase: "idle" }
  | { phase: "verifying" }
  | { phase: "verified"; verification: KeyVerification }
  | { phase: "failed"; error: LlmError };

/**
 * Driving adapter for the setup screen. Zero business branching: state
 * bookkeeping and delegation to the VerifyProviderKey use case only.
 */
export function useProviderSetup(deps: ProviderSetupDeps) {
  const [providerId, setProviderId] = useState<string>(PROVIDERS[0]?.id ?? "");
  const [custody, setCustody] = useState<KeyCustody>("memory");
  const [status, setStatus] = useState<SetupStatus>({ phase: "idle" });
  const vaultRef = useRef<VaultPort | null>(null);

  const provider = useMemo(() => providerById(providerId), [providerId]);

  const selectProvider = useCallback((id: string) => {
    setProviderId(id);
    setStatus({ phase: "idle" });
  }, []);

  const selectCustody = useCallback((next: KeyCustody) => {
    setCustody(next);
    setStatus({ phase: "idle" });
  }, []);

  const verify = useCallback(
    async (apiKey: string) => {
      if (!provider) return;
      setStatus({ phase: "verifying" });
      const vault = deps.makeVault(custody);
      vaultRef.current = vault;
      const gateway = deps.makeGateway(provider, vault);
      const result = await verifyProviderKey({ gateway, vault }, { apiKey });
      setStatus(
        result.ok
          ? { phase: "verified", verification: result.value }
          : { phase: "failed", error: result.error },
      );
    },
    [provider, custody, deps],
  );

  const wipeKey = useCallback(() => {
    vaultRef.current?.wipe();
    vaultRef.current = null;
    setStatus({ phase: "idle" });
  }, []);

  return {
    providers: PROVIDERS,
    provider,
    custody,
    status,
    selectProvider,
    selectCustody,
    verify,
    wipeKey,
  };
}