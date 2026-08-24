import { randomUUID } from "node:crypto";

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function correlationId(): string {
  return `cor_${randomUUID()}`;
}

export function idempotencyKey(...parts: (string | number)[]): string {
  return parts.join(":");
}
