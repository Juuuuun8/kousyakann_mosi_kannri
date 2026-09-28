import assert from "node:assert/strict";
import test from "node:test";

import { makeSyntheticAnswerMarks } from "../../test-fixtures/src/generator.ts";
import {
  canonicalJson,
  chunkPayloadJson,
  createPayloadRecords,
  reassemblePayloadJson,
  roundTripPayloadJson,
  verifyPayloadRecords,
} from "../src/index.ts";

test("canonicalJson sorts object keys but preserves array order", () => {
  assert.equal(canonicalJson({ z: 1, a: { d: 2, c: 3 }, items: [2, 1] }),
    '{"a":{"c":3,"d":2},"items":[2,1],"z":1}');
});

test("payload is losslessly chunked and reassembled at item boundaries", () => {
  const payload = makeSyntheticAnswerMarks("subject.synthetic.01", 64);
  const chunks = chunkPayloadJson(payload, 700);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.jsonText.length <= 700));
  assert.deepEqual(canonicalJson(reassemblePayloadJson(chunks)), canonicalJson(payload));
  assert.deepEqual(roundTripPayloadJson(payload, 700), reassemblePayloadJson(chunks));
  assert.equal(chunks.reduce((total, chunk) => total + chunk.itemCount, 0), payload.items.length);
});

test("small payload remains one canonical chunk", () => {
  const payload = makeSyntheticAnswerMarks("subject.synthetic.01", 1);
  const chunks = chunkPayloadJson(payload, 2000);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].chunkCount, 1);
  assert.deepEqual(JSON.parse(chunks[0].jsonText), payload);
});

test("missing, duplicate, and mixed chunks fail closed", () => {
  const payload = makeSyntheticAnswerMarks("subject.synthetic.01", 50);
  const chunks = chunkPayloadJson(payload, 700);
  assert.ok(chunks.length > 2);

  assert.throws(() => reassemblePayloadJson(chunks.slice(1)), /chunk count is inconsistent/);
  assert.throws(
    () => reassemblePayloadJson([chunks[0], { ...chunks[0], chunkIndex: 0 }, ...chunks.slice(2)]),
    /chunk identity or metadata is invalid/,
  );

  const altered = JSON.parse(chunks[1].jsonText);
  altered.subject = "subject.synthetic.02";
  assert.throws(
    () => reassemblePayloadJson([chunks[0], { ...chunks[1], jsonText: JSON.stringify(altered) }, ...chunks.slice(2)]),
    /payload chunk headers do not match/,
  );
});

test("a single item that cannot fit is rejected without truncation", () => {
  const payload = makeSyntheticAnswerMarks("subject.synthetic.01", 1);
  assert.throws(() => chunkPayloadJson(payload, 30), /single payload item exceeds maxChars|payload header exceeds maxChars/);
});

test("Sheet payload records carry verified chunk and whole-payload hashes", async () => {
  const payload = makeSyntheticAnswerMarks("subject.synthetic.01", 50);
  const records = await createPayloadRecords({
    payloadId: "70000000-0000-4000-8000-000000000001",
    reportId: "70000000-0000-4000-8000-000000000002",
    subjectDefinitionId: "subject.synthetic.01",
    payloadFormatVersion: "payload.v1",
    payload,
    createdAt: "2026-09-29T00:00:00Z",
    maxChars: 700,
  });
  assert.ok(records.length > 1);
  assert.deepEqual(await verifyPayloadRecords(records), payload);
  assert.ok(records.every((record) => record.payloadHash === records[0].payloadHash));
});

test("payload record verification rejects missing, altered, and mixed chunks", async () => {
  const base = await createPayloadRecords({
    payloadId: "70000000-0000-4000-8000-000000000003",
    reportId: "70000000-0000-4000-8000-000000000004",
    subjectDefinitionId: "subject.synthetic.01",
    payloadFormatVersion: "payload.v1",
    payload: makeSyntheticAnswerMarks("subject.synthetic.01", 50),
    createdAt: "2026-09-29T00:00:00Z",
    maxChars: 700,
  });
  await assert.rejects(() => verifyPayloadRecords(base.slice(1)), /chunk count is inconsistent/);
  await assert.rejects(() => verifyPayloadRecords([{ ...base[0], jsonText: `${base[0].jsonText} ` }, ...base.slice(1)]), /chunk hash mismatch/);
  await assert.rejects(() => verifyPayloadRecords([{ ...base[0], reportId: "70000000-0000-4000-8000-000000000005" }, ...base.slice(1)]), /identity or header mismatch/);
});
