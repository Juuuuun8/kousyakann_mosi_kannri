import type { PayloadJson } from "../../contracts/src/types.ts";
import { validatePayloadJson } from "../../contracts/src/validation.ts";

/** A Sheet-cell-safe chunk of one versioned payload. */
export interface PayloadChunkText {
  readonly chunkIndex: number;
  readonly chunkCount: number;
  readonly itemCount: number;
  readonly jsonText: string;
}

interface PayloadEnvelope {
  readonly [key: string]: unknown;
  readonly items: readonly unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!isRecord(value)) return value;

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
  return sorted;
}

/**
 * Serializes JSON with recursively sorted object keys. Array order is data and
 * is intentionally preserved, so answer order and report order cannot change.
 */
export function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value));
  if (serialized === undefined) throw new Error("value is not JSON serializable");
  return serialized;
}

function asEnvelope(payload: PayloadJson): PayloadEnvelope {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error("payload must be an object with an items array");
  }
  return payload as PayloadEnvelope;
}

function withoutItems(envelope: PayloadEnvelope): Record<string, unknown> {
  const header: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(envelope)) {
    if (key !== "items") header[key] = value;
  }
  return header;
}

function validateMaxChars(maxChars: number): void {
  if (!Number.isInteger(maxChars) || maxChars <= 0) {
    throw new Error("maxChars must be a positive integer");
  }
}

/**
 * Splits only at payload item boundaries. No substring truncation is used.
 * The returned JSON text is canonical and can be stored directly in a cell.
 */
export function chunkPayloadJson(
  payload: PayloadJson,
  maxChars = 40000,
): readonly PayloadChunkText[] {
  validateMaxChars(maxChars);
  const envelope = asEnvelope(payload);
  const wholeJson = canonicalJson(payload);
  if (wholeJson.length <= maxChars) {
    return [{ chunkIndex: 0, chunkCount: 1, itemCount: envelope.items.length, jsonText: wholeJson }];
  }

  const header = withoutItems(envelope);
  const chunks: string[] = [];
  let currentItems: unknown[] = [];

  for (const item of envelope.items) {
    const candidateItems = [...currentItems, item];
    const candidateJson = canonicalJson({ ...header, items: candidateItems });
    if (candidateJson.length <= maxChars) {
      currentItems = candidateItems;
      continue;
    }

    if (currentItems.length === 0) {
      throw new Error("a single payload item exceeds maxChars");
    }
    chunks.push(canonicalJson({ ...header, items: currentItems }));
    currentItems = [item];
    const singleItemJson = canonicalJson({ ...header, items: currentItems });
    if (singleItemJson.length > maxChars) {
      throw new Error("a single payload item exceeds maxChars");
    }
  }

  if (currentItems.length > 0 || envelope.items.length === 0) {
    const finalJson = canonicalJson({ ...header, items: currentItems });
    if (finalJson.length > maxChars) throw new Error("payload header exceeds maxChars");
    chunks.push(finalJson);
  }

  const chunkCount = chunks.length;
  return chunks.map((jsonText, chunkIndex) => {
    const parsed = JSON.parse(jsonText) as PayloadEnvelope;
    return {
      chunkIndex,
      chunkCount,
      itemCount: parsed.items.length,
      jsonText,
    };
  });
}

/**
 * Validates chunk identity and header consistency before rebuilding one
 * payload. Missing, duplicate, reordered, or mixed payload chunks fail closed.
 */
export function reassemblePayloadJson(chunks: readonly PayloadChunkText[]): PayloadJson {
  if (chunks.length === 0) throw new Error("at least one payload chunk is required");

  const expectedCount = chunks[0]!.chunkCount;
  if (!Number.isInteger(expectedCount) || expectedCount < 1 || expectedCount !== chunks.length) {
    throw new Error("chunk count is inconsistent");
  }

  const ordered = [...chunks].sort((left, right) => left.chunkIndex - right.chunkIndex);
  const parsedEnvelopes: PayloadEnvelope[] = [];
  let headerJson: string | null = null;

  for (const [position, chunk] of ordered.entries()) {
    if (
      !Number.isInteger(chunk.chunkIndex) ||
      chunk.chunkIndex !== position ||
      chunk.chunkCount !== expectedCount ||
      !Number.isInteger(chunk.itemCount) ||
      chunk.itemCount < 0 ||
      typeof chunk.jsonText !== "string" ||
      chunk.jsonText.length === 0
    ) {
      throw new Error("chunk identity or metadata is invalid");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(chunk.jsonText);
    } catch {
      throw new Error("chunk JSON is invalid");
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.items)) {
      throw new Error("chunk JSON must contain an items array");
    }
    const envelope = parsed as PayloadEnvelope;
    if (chunk.itemCount !== envelope.items.length) throw new Error("item count is inconsistent");

    const currentHeaderJson = canonicalJson(withoutItems(envelope));
    if (headerJson === null) headerJson = currentHeaderJson;
    if (headerJson !== currentHeaderJson) throw new Error("payload chunk headers do not match");
    parsedEnvelopes.push(envelope);
  }

  const first = parsedEnvelopes[0]!;
  const items = parsedEnvelopes.flatMap((envelope) => [...envelope.items]);
  const rebuilt: unknown = { ...first, items };
  if (!validatePayloadJson(rebuilt).ok) throw new Error("reassembled payload violates the canonical contract");
  return rebuilt as PayloadJson;
}

export function roundTripPayloadJson(payload: PayloadJson, maxChars = 40000): PayloadJson {
  return reassemblePayloadJson(chunkPayloadJson(payload, maxChars));
}
