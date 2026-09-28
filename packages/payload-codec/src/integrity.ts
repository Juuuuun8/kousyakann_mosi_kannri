import type { IsoDateTime, PayloadJson, PayloadRecord, Sha256Hex, SubjectDefinitionId, UUID } from "../../contracts/src/types.ts";
import { validatePayloadRecord } from "../../contracts/src/validation.ts";
import { canonicalJson, chunkPayloadJson, reassemblePayloadJson } from "./codec.ts";

export interface CreatePayloadRecordsInput {
  readonly payloadId: UUID;
  readonly reportId: UUID;
  readonly subjectDefinitionId: SubjectDefinitionId | null;
  readonly payloadFormatVersion: string;
  readonly payload: PayloadJson;
  readonly createdAt: IsoDateTime;
  readonly maxChars?: number;
}

function hex(bytes: Uint8Array): Sha256Hex {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("") as Sha256Hex;
}

export async function sha256Text(value: string): Promise<Sha256Hex> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return hex(new Uint8Array(digest));
}

export async function createPayloadRecords(input: CreatePayloadRecordsInput): Promise<readonly PayloadRecord[]> {
  if (!input.payloadFormatVersion.trim()) throw new Error("payloadFormatVersion is required");
  const canonical = canonicalJson(input.payload);
  const payloadHash = await sha256Text(canonical);
  const chunks = chunkPayloadJson(input.payload, input.maxChars);
  return Promise.all(chunks.map(async (chunk) => {
    const record: PayloadRecord = {
      payloadId: input.payloadId,
      reportId: input.reportId,
      payloadType: input.payload.type === "domain_results" ? "DOMAIN" : input.payload.type === "answer_marks" ? "ANSWER_MARKS" : input.payload.type === "targets" ? "TARGETS" : input.payload.type === "narrative" ? "NARRATIVE" : input.payload.type === "trend" ? "TREND" : "RAW_LABELS",
      subjectDefinitionId: input.subjectDefinitionId,
      payloadFormatVersion: input.payloadFormatVersion,
      chunkIndex: chunk.chunkIndex,
      chunkCount: chunk.chunkCount,
      itemCount: chunk.itemCount,
      payloadHash,
      chunkHash: await sha256Text(chunk.jsonText),
      jsonText: chunk.jsonText,
      createdAt: input.createdAt,
    };
    const validation = validatePayloadRecord(record);
    if (!validation.ok) throw new Error(`generated payload record is invalid: ${validation.issues.map((item) => `${item.path}:${item.code}`).join(",")}`);
    return record;
  }));
}

function same<T>(records: readonly PayloadRecord[], read: (record: PayloadRecord) => T): boolean {
  return new Set(records.map(read)).size === 1;
}

export async function verifyPayloadRecords(records: readonly PayloadRecord[]): Promise<PayloadJson> {
  if (records.length === 0) throw new Error("at least one payload record is required");
  for (const record of records) {
    const validation = validatePayloadRecord(record);
    if (!validation.ok) throw new Error("payload record violates the canonical contract");
    if (await sha256Text(record.jsonText) !== record.chunkHash) throw new Error("payload chunk hash mismatch");
  }
  if (!same(records, (record) => record.payloadId) || !same(records, (record) => record.reportId) ||
      !same(records, (record) => record.payloadType) || !same(records, (record) => record.subjectDefinitionId) ||
      !same(records, (record) => record.payloadFormatVersion) || !same(records, (record) => record.payloadHash) ||
      !same(records, (record) => record.chunkCount)) {
    throw new Error("payload record identity or header mismatch");
  }
  const payload = reassemblePayloadJson(records.map((record) => ({
    chunkIndex: record.chunkIndex,
    chunkCount: record.chunkCount,
    itemCount: record.itemCount,
    jsonText: record.jsonText,
  })));
  if (await sha256Text(canonicalJson(payload)) !== records[0]!.payloadHash) throw new Error("payload hash mismatch");
  return payload;
}
