import type {
  AnswerMarksPayload,
  DomainPayload,
  ExamEventId,
  IsoDateTime,
  LocationId,
  PayloadJson,
  PersonId,
  ReportRecord,
  SchemaVersionId,
  Sha256Hex,
  SubjectScoreRecord,
  SubjectDefinitionId,
  MetricDefinitionId,
  UUID,
} from "../../contracts/src/types.ts";

export interface SyntheticDataset {
  readonly reports: readonly ReportRecord[];
  readonly subjectScores: readonly SubjectScoreRecord[];
  readonly payloads: readonly PayloadJson[];
  readonly payloadBindings: readonly SyntheticPayloadBinding[];
}

export interface SyntheticPayloadBinding {
  readonly reportId: UUID;
  readonly subjectDefinitionId: SubjectDefinitionId;
  readonly payload: PayloadJson;
}

export interface SyntheticDatasetOptions {
  readonly reportCount?: number;
  readonly subjectsPerReport?: number;
  readonly itemsPerSubject?: number;
}

function uuid(index: number): UUID {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` as UUID;
}

function hash(index: number): Sha256Hex {
  return index.toString(16).padStart(64, "0").slice(-64) as Sha256Hex;
}

function subjectId(index: number): SubjectDefinitionId {
  return `subject.synthetic.${String(index).padStart(2, "0")}` as SubjectDefinitionId;
}

function personId(index: number): PersonId {
  return uuid(index) as PersonId;
}

export function makeSyntheticAnswerMarks(
  subject: string,
  itemsPerSubject = 40,
): AnswerMarksPayload {
  return {
    v: 1,
    type: "answer_marks",
    subject,
    items: Array.from({ length: itemsPerSubject }, (_, index) => {
      const answerNo = String(index + 1);
      const isCorrect = index % 3 !== 0;
      return [
        Math.floor(index / 10) + 1,
        answerNo,
        isCorrect ? "○" : "×",
        isCorrect ? "CORRECT" : "WRONG",
        isCorrect ? String((index % 5) + 1) : String(((index + 2) % 5) + 1),
        null,
      ] as const;
    }),
  };
}

export function makeSyntheticDomainResults(subject: string, count = 8): DomainPayload {
  return {
    v: 1,
    type: "domain_results",
    subject,
    items: Array.from({ length: count }, (_, index) => ({
      domainRaw: `合成分野${index + 1}`,
      domainId: `domain.synthetic.${index + 1}`,
      score: 4 + (index % 5),
      maxScore: 10,
      nationalAverage: 5 + (index % 3) / 10,
      schoolAverage: 5.2 + (index % 2) / 10,
      sameAbilityAverage: 5.5 + (index % 4) / 10,
      scoreRateDifference: (index % 4 - 1.5) / 10,
      evaluationCodeRaw: index % 4 === 0 ? "最良" : null,
      nextLevelAverage: 6 + (index % 3) / 10,
      commentaryRaw: `合成講評${index + 1}`,
      missingReason: null,
    })),
  };
}

export function makeSyntheticDataset(options: SyntheticDatasetOptions = {}): SyntheticDataset {
  const reportCount = options.reportCount ?? 2;
  const subjectsPerReport = options.subjectsPerReport ?? 3;
  const itemsPerSubject = options.itemsPerSubject ?? 40;
  const reports: ReportRecord[] = [];
  const subjectScores: SubjectScoreRecord[] = [];
  const payloads: PayloadJson[] = [];
  const payloadBindings: SyntheticPayloadBinding[] = [];

  for (let reportIndex = 0; reportIndex < reportCount; reportIndex += 1) {
    const reportNumber = reportIndex + 1;
    const reportId = uuid(reportNumber);
    const reportPersonId = personId(1000 + reportNumber);
    const version = "kawai.ct.2026.round-2.v1";
    reports.push({
      reportId,
      status: "ACTIVE",
      locationId: `loc.synthetic.${(reportIndex % 2) + 1}` as LocationId,
      examEventId: "kawai.ct.2026.round-2" as ExamEventId,
      personId: reportPersonId,
      identityStatus: "NEW_CONFIRMED",
      examCandidateId: `candidate.synthetic.${reportNumber}`,
      schoolCodeRaw: `SYNTHETIC-${(reportIndex % 3) + 1}`,
      schoolNameRaw: `合成学校${(reportIndex % 3) + 1}`,
      gradeRaw: "3",
      classRaw: `SYNTH-${reportNumber}`,
      localNumberRaw: String(reportNumber).padStart(3, "0"),
      studentNameKanaRaw: `テスト セイト${reportNumber}`,
      schemaVersionId: version as SchemaVersionId,
      parserVersion: "kawai-parser@0.1.0",
      normalizationVersion: "normalization@0.1.0",
      pdfHash: hash(reportNumber),
      semanticFingerprint: hash(100 + reportNumber),
      pageCount: 4,
      subjectCount: subjectsPerReport,
      payloadCount: subjectsPerReport * 2,
      importedAt: `2026-09-28T00:0${reportIndex}:00Z` as IsoDateTime,
      importedBy: "synthetic@example.invalid",
      supersedesReportId: null,
    });

    for (let subjectIndex = 0; subjectIndex < subjectsPerReport; subjectIndex += 1) {
      const subject = subjectId(subjectIndex + 1);
      subjectScores.push({
        recordId: uuid(10000 + reportNumber * 100 + subjectIndex),
        reportId,
        subjectDefinitionId: subject,
        metricDefinitionId: "metric.raw-score" as MetricDefinitionId,
        score: 40 + subjectIndex + reportIndex,
        maxScore: 100,
        scoreRate: (40 + subjectIndex + reportIndex) / 100,
        deviation: 48 + subjectIndex + reportIndex,
        abilityLevel: subjectIndex % 2 === 0 ? "B" : "C",
        nationalAverage: 50,
        nationalRank: 100 + reportIndex,
        nationalPopulation: 1000,
        currentStudentAverage: 49,
        graduateAverage: 52,
        currentRank: 10 + reportIndex,
        currentPopulation: 100,
        schoolDeviation: 47 + subjectIndex,
        schoolAverage: 51,
        schoolRank: 3 + reportIndex,
        schoolPopulation: 20,
        missingReason: null,
        sourceLabelRaw: `合成科目${subjectIndex + 1}`,
        valueHash: hash(20000 + reportNumber * 100 + subjectIndex),
        schemaVersionId: version,
        parserVersion: "kawai-parser@0.1.0",
        normalizationVersion: "normalization@0.1.0",
      });
      const answerMarks = makeSyntheticAnswerMarks(subject, itemsPerSubject);
      const domainResults = makeSyntheticDomainResults(subject);
      payloads.push(answerMarks, domainResults);
      payloadBindings.push(
        { reportId, subjectDefinitionId: subject, payload: answerMarks },
        { reportId, subjectDefinitionId: subject, payload: domainResults },
      );
    }
  }

  return { reports, subjectScores, payloads, payloadBindings };
}
