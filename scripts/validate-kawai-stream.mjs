import process from "node:process";

import { validatePayloadJson } from "../packages/contracts/src/index.ts";
import { runParserPipeline } from "../packages/parsers/core/src/index.ts";
import { createKawaiSchema } from "../packages/parsers/kawai/src/index.ts";

let json = "";
for await (const chunk of process.stdin) json += chunk;
const document = JSON.parse(json);
const result = runParserPipeline(document, createKawaiSchema(), {
  parserVersion: "kawai-parser@0.6.0",
  normalizationVersion: "normalization@0.1.0",
});
const normalization = result.normalization;
const metricCounts = Object.fromEntries(
  [...new Set((normalization?.subjectScores ?? []).map((record) => record.metricDefinitionId))]
    .map((metric) => [metric, normalization?.subjectScores.filter((record) => record.metricDefinitionId === metric).length ?? 0]),
);
const payloadCounts = (normalization?.payloads ?? []).reduce((counts, payload) => ({
  ...counts,
  [payload.type]: (counts[payload.type] ?? 0) + payload.items.length,
}), {});
const payloadContractsValid = (normalization?.payloads ?? []).every((payload) => validatePayloadJson(payload).ok);
process.stdout.write(`${JSON.stringify({
  status: result.status,
  detection: result.detection.status,
  metricCounts,
  payloadCounts,
  payloadContractsValid,
  rawLabelsPresent: (normalization?.payloads ?? []).some((payload) => payload.type === "raw_labels"),
  unknownSubjectLabels: [
    ...(normalization?.subjectScores ?? []).filter((record) => !record.subjectDefinitionId).map((record) => record.sourceLabelRaw),
    ...(normalization?.payloads ?? []).filter((payload) => payload.type === "trend").flatMap((payload) => payload.items.filter((item) => !item.subjectDefinitionId).map((item) => item.subjectRaw)),
  ],
  issueCodes: result.validation?.issues.map((entry) => entry.code) ?? [],
})}\n`);
