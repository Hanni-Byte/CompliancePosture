import type { KeyCustody, VaultError, VaultPort } from "../../application/ports/vault";
import type { Result } from "../../application/result";
import { err, ok } from "../../application/result";

export class FakeVault implements VaultPort {
  wiped = 0;
  readonly custody: KeyCustody;
  /** When set, `store` fails with this message (simulates disabled storage). */
  refuse: string | null = null;
  private key: string | null = null;

  constructor(custody: KeyCustody = "memory") {
    this.custody = custody;
  }

  store(apiKey: string): Result<void, VaultError> {
    if (this.refuse !== null) return err({ message: this.refuse });
    this.key = apiKey;
    return ok(undefined);
  }

  retrieve(): string | null {
    return this.key;
  }

  wipe(): void {
    this.key = null;
    this.wiped += 1;
  }
}
