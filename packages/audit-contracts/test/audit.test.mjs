import assert from "node:assert/strict";
import test from "node:test";

import { createAuditRecord, validateAuditRecord, verifyAuditChain } from "../src/index.ts";

const base = {
  auditId: "audit.synthetic.1",
  occurredAt: "2026-09-29T00:00:00Z",
  actorUserId: "user.synthetic",
  actorRole: "ADMIN",
  action: "ANALYSIS_VIEW",
  result: "SUCCESS",
  requestId: "request.synthetic.1",
  targetKind: "EXAM_EVENT",
  targetId: "exam.synthetic.1",
  detailCode: "VIEW_READY",
  itemCount: null,
  purpose: null,
  previousHash: null,
};

test("closed audit record accepts no data-body columns", async () => {
  const record = await createAuditRecord(base);
  assert.equal(validateAuditRecord(record).ok, true);
  assert.equal(validateAuditRecord({ ...record, studentName: "forbidden" }).ok, false);
  assert.equal(validateAuditRecord({ ...record, csvBody: "forbidden" }).ok, false);
});

test("ML export requires purpose, count, and export target", async () => {
  await assert.rejects(() => createAuditRecord({ ...base, action: "ML_EXPORT" }), /ML_EXPORT_FIELDS/u);
  const record = await createAuditRecord({ ...base, action: "ML_EXPORT", targetKind: "EXPORT", targetId: "export.synthetic.1", purpose: "合成モデル検証", itemCount: 20 });
  assert.equal(record.itemCount, 20);
});

test("hash chain detects body edits, reordering, and missing links", async () => {
  const first = await createAuditRecord(base);
  const second = await createAuditRecord({ ...base, auditId: "audit.synthetic.2", requestId: "request.synthetic.2", previousHash: first.recordHash });
  assert.equal((await verifyAuditChain([first, second])).ok, true);
  assert.equal((await verifyAuditChain([second, first])).ok, false);
  assert.equal((await verifyAuditChain([first, { ...second, itemCount: 1 }])).ok, false);
});

test("audit strings and counters are bounded", async () => {
  await assert.rejects(() => createAuditRecord({ ...base, purpose: "x\nforbidden" }), /PURPOSE/u);
  await assert.rejects(() => createAuditRecord({ ...base, itemCount: -1 }), /ITEM_COUNT/u);
  await assert.rejects(() => createAuditRecord({ ...base, detailCode: "free text" }), /DETAIL_CODE/u);
});
