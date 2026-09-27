import assert from "node:assert/strict";
import test from "node:test";

import { makeSyntheticAnswerMarks } from "../../test-fixtures/src/generator.ts";
import {
  canonicalJson,
  chunkPayloadJson,
  reassemblePayloadJson,
  roundTripPayloadJson,
} from "../src/codec.ts";

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
