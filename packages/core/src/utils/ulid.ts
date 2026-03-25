import { ulid } from "ulidx";

export function generateId(): string {
  return ulid();
}

export function getDeviceId(): string {
  // In production, this would be set per-device during initial setup
  // and stored securely. For now, generate once and cache.
  if (!globalDeviceId) {
    globalDeviceId = ulid();
  }
  return globalDeviceId;
}

let globalDeviceId: string | null = null;

export function setDeviceId(id: string): void {
  globalDeviceId = id;
}
