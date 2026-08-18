import type { KeyCustody, VaultPort } from "../../application/ports/vault";

export class FakeVault implements VaultPort {
  wiped = 0;
  readonly custody: KeyCustody;
  private key: string | null = null;

  constructor(custody: KeyCustody = "memory") {
    this.custody = custody;
  }

  store(apiKey: string): void {
    this.key = apiKey;
  }

  retrieve(): string | null {
    return this.key;
  }

  wipe(): void {
    this.key = null;
    this.wiped += 1;
  }
}