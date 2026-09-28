import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const datasetPath = path.join(repoRoot, "packages", "frontend-prototype", "data", "demo-dataset.json");
const outputDir = path.join(repoRoot, "outputs", "company-demo-2026-09-29");
const outputPath = path.join(outputDir, "模試成績分析_架空デモデータ.xlsx");
const previewPath = path.join(outputDir, "demo-dashboard.png");
const previewDir = path.join(outputDir, "previews");
const data = JSON.parse(await fs.readFile(datasetPath, "utf8"));

const wb = Workbook.create();
const dashboard = wb.worksheets.add("Dashboard");
const studentSummarySheet = wb.worksheets.add("StudentSummary");
const reportsSheet = wb.worksheets.add("Reports");
const scoresSheet = wb.worksheets.add("SubjectScores");
const domainsSheet = wb.worksheets.add("Domains");
const targetsSheet = wb.worksheets.add("Targets");
const answersSheet = wb.worksheets.add("Answers");
const definitionsSheet = wb.worksheets.add("Definitions");
const readmeSheet = wb.worksheets.add("ReadMe");

const font = "Arial";
const navy = "#163846";
const teal = "#176B87";
const pale = "#E7F3F6";
const amber = "#FFF1CC";
const line = "#DCE4E8";
const text = "#17202A";

function styleAll(sheet) {
  sheet.showGridLines = false;
  const used = sheet.getUsedRange();
  if (used) used.format.font = { name: font, size: 10, color: text };
}

function tableHeader(range) {
  range.format = {
    fill: navy,
    font: { name: font, size: 10, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    borders: { preset: "inside", style: "thin", color: "#FFFFFF" },
  };
  range.format.rowHeight = 24;
}

function addTable(sheet, name, headers, rows) {
  sheet.getRange("A1").write([headers, ...rows]);
  tableHeader(sheet.getRangeByIndexes(0, 0, 1, headers.length));
  sheet.getRangeByIndexes(1, 0, rows.length, headers.length).format.borders = { preset: "insideHorizontal", style: "thin", color: line };
  sheet.tables.add(sheet.getRangeByIndexes(0, 0, rows.length + 1, headers.length), true, name);
  sheet.freezePanes.freezeRows(1);
  styleAll(sheet);
}

const locationById = new Map(data.locations.map((item) => [item.id, item.label]));
const schoolById = new Map(data.schools.map((item) => [item.id, item.label]));
const eventById = new Map(data.examEvents.map((item) => [item.id, item.label]));
const subjectById = new Map(data.subjectDefinitions.map((item) => [item.id, item]));
const domainById = new Map(data.domainDefinitions.map((item) => [item.id, item.label]));
const studentById = new Map(data.students.map((item) => [item.personId, item]));

addTable(reportsSheet, "ReportsTable",
  ["ReportID", "PersonID", "表示名", "ExamEventID", "模試回次", "Status", "LocationID", "校舎", "SchoolID", "高校", "学年", "SchemaVersion", "完全率"],
  data.reports.map((item) => {
    const student = item.personId ? studentById.get(item.personId) : null;
    return [item.reportId, item.personId, student?.displayLabel ?? "未確定", item.eventId, eventById.get(item.eventId), item.status, item.locationId, locationById.get(item.locationId), student?.schoolId ?? null, student ? schoolById.get(student.schoolId) : null, student?.grade ?? null, item.schemaVersion, item.completeness];
  }),
);
reportsSheet.getRange(`M2:M${data.reports.length + 1}`).format.numberFormat = "0.0%";

addTable(scoresSheet, "SubjectScoresTable",
  ["ReportID", "PersonID", "表示名", "ExamEventID", "校舎", "高校", "SubjectID", "科目", "得点", "満点", "得点率", "全国平均得点率", "偏差値", "学力レベル", "欠損理由"],
  data.scores.map((item) => {
    const student = studentById.get(item.personId);
    const subject = subjectById.get(item.subjectId);
    return [item.reportId, item.personId, student.displayLabel, item.eventId, locationById.get(item.locationId), schoolById.get(item.schoolId), item.subjectId, subject.label, item.score, item.maxScore, item.scoreRate, item.nationalAverage / 100, item.deviation, item.abilityLevel, item.missingReason];
  }),
);
scoresSheet.getRange(`K2:L${data.scores.length + 1}`).format.numberFormat = "0.0%";
scoresSheet.getRange(`M2:M${data.scores.length + 1}`).format.numberFormat = "0.0";

const studentHeaders = ["PersonID", "表示名", "校舎", "高校", "今回得点", "今回満点", "今回得点率", "前回得点", "前回満点", "前回得点率", "変化"];
studentSummarySheet.getRange("A1:K1").values = [studentHeaders];
studentSummarySheet.getRange("A2").write(data.students.map((student) => [student.personId, student.displayLabel, locationById.get(student.locationId), schoolById.get(student.schoolId)]));
for (const [index, student] of data.students.entries()) {
  const row = index + 2;
  studentSummarySheet.getRange(`E${row}:K${row}`).formulas = [[
    `=SUMIFS(SubjectScores!$I$2:$I$${data.scores.length + 1},SubjectScores!$B$2:$B$${data.scores.length + 1},"${student.personId}",SubjectScores!$D$2:$D$${data.scores.length + 1},"${data.meta.activeEventId}")`,
    `=SUMIFS(SubjectScores!$J$2:$J$${data.scores.length + 1},SubjectScores!$B$2:$B$${data.scores.length + 1},"${student.personId}",SubjectScores!$D$2:$D$${data.scores.length + 1},"${data.meta.activeEventId}",SubjectScores!$O$2:$O$${data.scores.length + 1},"<>NOT_TAKEN")`,
    `=E${row}/F${row}`,
    `=SUMIFS(SubjectScores!$I$2:$I$${data.scores.length + 1},SubjectScores!$B$2:$B$${data.scores.length + 1},"${student.personId}",SubjectScores!$D$2:$D$${data.scores.length + 1},"${data.meta.baselineEventId}")`,
    `=SUMIFS(SubjectScores!$J$2:$J$${data.scores.length + 1},SubjectScores!$B$2:$B$${data.scores.length + 1},"${student.personId}",SubjectScores!$D$2:$D$${data.scores.length + 1},"${data.meta.baselineEventId}",SubjectScores!$O$2:$O$${data.scores.length + 1},"<>NOT_TAKEN")`,
    `=H${row}/I${row}`,
    `=G${row}-J${row}`,
  ]];
}
tableHeader(studentSummarySheet.getRange("A1:K1"));
studentSummarySheet.tables.add(`A1:K${data.students.length + 1}`, true, "StudentSummaryTable");
studentSummarySheet.getRange(`G2:G${data.students.length + 1}`).format.numberFormat = "0.0%";
studentSummarySheet.getRange(`J2:K${data.students.length + 1}`).format.numberFormat = "0.0%";
studentSummarySheet.freezePanes.freezeRows(1);
styleAll(studentSummarySheet);

addTable(domainsSheet, "DomainsTable",
  ["PersonID", "表示名", "ExamEventID", "校舎", "高校", "SubjectID", "科目", "DomainID", "分野", "得点", "満点", "得点率", "全国平均得点率", "同学力帯平均得点率", "欠損理由"],
  data.domains.map((item) => {
    const student = studentById.get(item.personId);
    return [item.personId, student.displayLabel, item.eventId, locationById.get(item.locationId), schoolById.get(item.schoolId), item.subjectId, subjectById.get(item.subjectId).label, item.domainId, domainById.get(item.domainId), item.score, item.maxScore, item.scoreRate, item.nationalAverageRate, item.sameAbilityAverageRate, item.missingReason];
  }),
);
domainsSheet.getRange(`L2:N${data.domains.length + 1}`).format.numberFormat = "0.0%";

addTable(targetsSheet, "TargetsTable",
  ["PersonID", "表示名", "ExamEventID", "志望順位", "志望校（架空）", "判定", "ボーダー差", "指標"],
  data.targets.map((item) => [item.personId, studentById.get(item.personId).displayLabel, item.eventId, item.preferenceOrder, item.targetLabel, item.judgement, item.borderGap, item.metric]),
);

addTable(answersSheet, "AnswersTable",
  ["PersonID", "表示名", "ExamEventID", "科目", "正答", "誤答", "部分点", "無回答", "余分マーク", "設問数"],
  data.answers.map((item) => [item.personId, studentById.get(item.personId).displayLabel, item.eventId, subjectById.get(item.subjectId).label, item.correct, item.wrong, item.partial, item.blank, item.extra, item.correct + item.wrong + item.partial + item.blank + item.extra]),
);

definitionsSheet.getRange("A1:D1").values = [["区分", "ID", "表示名", "補足"]];
const definitionRows = [
  ...data.examEvents.map((item) => ["模試回次", item.id, item.label, item.examDate]),
  ...data.locations.map((item) => ["校舎", item.id, item.label, "架空校舎"]),
  ...data.schools.map((item) => ["高校", item.id, item.label, "架空高校"]),
  ...data.subjectDefinitions.map((item) => ["科目", item.id, item.label, `満点 ${item.maxScore}`]),
  ...data.domainDefinitions.map((item) => ["分野", item.id, item.label, `満点 ${item.maxScore}`]),
];
definitionsSheet.getRange("A2").write(definitionRows);
tableHeader(definitionsSheet.getRange("A1:D1"));
definitionsSheet.tables.add(`A1:D${definitionRows.length + 1}`, true, "DefinitionsTable");
definitionsSheet.freezePanes.freezeRows(1);
styleAll(definitionsSheet);

dashboard.getRange("A1:M30").format.font = { name: font, size: 10, color: text };
dashboard.getRange("A2:H2").merge();
dashboard.getRange("A2").values = [["全統共通テスト模試 架空データ分析"]];
dashboard.getRange("A2").format.font = { name: font, size: 16, bold: true, color: navy };
dashboard.getRange("A3:H3").merge();
dashboard.getRange("A3").values = [[data.meta.notice]];
dashboard.getRange("A3").format = { fill: amber, font: { name: font, size: 10, bold: true, color: "#6F4D00" }, verticalAlignment: "center" };
dashboard.getRange("A5:F5").values = [["登録生徒数", "", "平均得点率", "", "欠損科目数", ""]];
dashboard.getRange("A6:F6").formulas = [[
  `=COUNTIFS(Reports!$D$2:$D$${data.reports.length + 1},"${data.meta.activeEventId}",Reports!$F$2:$F$${data.reports.length + 1},"ACTIVE")`, "",
  `=SUM(StudentSummary!$G$2:$G$${data.students.length + 1})/COUNTIFS(StudentSummary!$G$2:$G$${data.students.length + 1},">=0")`, "",
  `=COUNTIFS(SubjectScores!$D$2:$D$${data.scores.length + 1},"${data.meta.activeEventId}",SubjectScores!$O$2:$O$${data.scores.length + 1},"<>")`, "",
]];
for (const cell of ["A5:B6", "C5:D6", "E5:F6"]) dashboard.getRange(cell).format = { fill: pale, borders: { preset: "outside", style: "thin", color: line } };
dashboard.getRange("A5:F5").format.font = { name: font, size: 10, bold: true, color: teal };
dashboard.getRange("A6:F6").format.font = { name: font, size: 16, bold: true, color: text };
dashboard.getRange("C6").format.numberFormat = "0.0%";

dashboard.getRange("A9:D9").values = [["科目", "対象数", "平均得点率", "平均偏差値"]];
tableHeader(dashboard.getRange("A9:D9"));
const scoreEnd = data.scores.length + 1;
for (const [index, subject] of data.subjectDefinitions.entries()) {
  const row = 10 + index;
  dashboard.getRange(`A${row}`).values = [[subject.label]];
  dashboard.getRange(`B${row}:D${row}`).formulas = [[
    `=COUNTIFS(SubjectScores!$D$2:$D$${scoreEnd},"${data.meta.activeEventId}",SubjectScores!$G$2:$G$${scoreEnd},"${subject.id}",SubjectScores!$K$2:$K$${scoreEnd},">=0")`,
    `=SUMIFS(SubjectScores!$K$2:$K$${scoreEnd},SubjectScores!$D$2:$D$${scoreEnd},"${data.meta.activeEventId}",SubjectScores!$G$2:$G$${scoreEnd},"${subject.id}")/COUNTIFS(SubjectScores!$D$2:$D$${scoreEnd},"${data.meta.activeEventId}",SubjectScores!$G$2:$G$${scoreEnd},"${subject.id}",SubjectScores!$K$2:$K$${scoreEnd},">=0")`,
    `=SUMIFS(SubjectScores!$M$2:$M$${scoreEnd},SubjectScores!$D$2:$D$${scoreEnd},"${data.meta.activeEventId}",SubjectScores!$G$2:$G$${scoreEnd},"${subject.id}")/COUNTIFS(SubjectScores!$D$2:$D$${scoreEnd},"${data.meta.activeEventId}",SubjectScores!$G$2:$G$${scoreEnd},"${subject.id}",SubjectScores!$M$2:$M$${scoreEnd},">=0")`,
  ]];
}
dashboard.getRange(`C10:C${9 + data.subjectDefinitions.length}`).format.numberFormat = "0.0%";
dashboard.getRange(`D10:D${9 + data.subjectDefinitions.length}`).format.numberFormat = "0.0";
dashboard.getRange(`A10:D${9 + data.subjectDefinitions.length}`).format.borders = { preset: "insideHorizontal", style: "thin", color: line };

dashboard.getRange("A20:C20").values = [["校舎", "受験者数", "平均得点率"]];
tableHeader(dashboard.getRange("A20:C20"));
for (const [index, location] of data.locations.entries()) {
  const row = 21 + index;
  dashboard.getRange(`A${row}`).values = [[location.label]];
  dashboard.getRange(`B${row}:C${row}`).formulas = [[
    `=COUNTIFS(Reports!$D$2:$D$${data.reports.length + 1},"${data.meta.activeEventId}",Reports!$G$2:$G$${data.reports.length + 1},"${location.id}",Reports!$F$2:$F$${data.reports.length + 1},"ACTIVE")`,
    `=SUMIFS(SubjectScores!$K$2:$K$${scoreEnd},SubjectScores!$D$2:$D$${scoreEnd},"${data.meta.activeEventId}",SubjectScores!$E$2:$E$${scoreEnd},"${location.label}")/COUNTIFS(SubjectScores!$D$2:$D$${scoreEnd},"${data.meta.activeEventId}",SubjectScores!$E$2:$E$${scoreEnd},"${location.label}",SubjectScores!$K$2:$K$${scoreEnd},">=0")`,
  ]];
}
dashboard.getRange(`C21:C${20 + data.locations.length}`).format.numberFormat = "0.0%";
dashboard.getRange(`A21:C${20 + data.locations.length}`).format.borders = { preset: "insideHorizontal", style: "thin", color: line };

const subjectChart = dashboard.charts.add("bar", [dashboard.getRange(`A9:A${9 + data.subjectDefinitions.length}`), dashboard.getRange(`C9:C${9 + data.subjectDefinitions.length}`)]);
subjectChart.title = "科目別平均得点率";
subjectChart.titleTextStyle.typeface = font;
subjectChart.legend = { position: "top", textStyle: { typeface: font } };
subjectChart.xAxis = { axisType: "textAxis", textStyle: { typeface: font } };
subjectChart.yAxis = { numberFormatCode: "0%", numberFormatSourceLinked: false, textStyle: { typeface: font } };
subjectChart.setPosition("F9", "M24");

dashboard.getRange("A26:H27").merge();
dashboard.getRange("A26").values = [["このシートは説明用の架空データです。得点・偏差値・分野・志望校判定・解答結果の構造は帳票を参考にしていますが、氏名・学校・数値はすべて生成しています。"]];
dashboard.getRange("A26").format = { fill: "#F4F7F9", font: { name: font, size: 9, italic: true, color: "#52616A" }, wrapText: true, verticalAlignment: "center" };
dashboard.showGridLines = false;
dashboard.tabColor = navy;
dashboard.getRange("A:A").format.columnWidth = 24;
dashboard.getRange("B:F").format.columnWidth = 14;
dashboard.freezePanes.freezeRows(3);

readmeSheet.getRange("A2:F2").merge();
readmeSheet.getRange("A2").values = [["架空デモデータについて"]];
readmeSheet.getRange("A2").format.font = { name: font, size: 16, bold: true, color: navy };
readmeSheet.getRange("A4:B10").values = [
  ["用途", "会社説明用の機能デモ"],
  ["データ", "全24人・2回次・7科目。氏名、学校、校舎、成績、志望校はすべて架空"],
  ["帳票構造参考", "ユーザー提供の河合塾・全統共通テスト模試 個人成績表（4ページ）"],
  ["正本との違い", "このファイルはデモ用。将来は職場Google Driveの非共有Sheetを正本とする"],
  ["欠損", "未受験を0点にせず、欠損理由として保持"],
  ["更新方法", "同じdemo-dataset.jsonからWeb画面とこのWorkbookを再生成"],
  ["DatasetVersion", data.meta.datasetVersion],
];
readmeSheet.getRange("A4:A10").format = { fill: pale, font: { name: font, bold: true, color: teal } };
readmeSheet.getRange("A4:B10").format.borders = { preset: "insideHorizontal", style: "thin", color: line };
readmeSheet.getRange("B4:B10").format.wrapText = true;
readmeSheet.showGridLines = false;
readmeSheet.tabColor = "#93AAB4";
styleAll(readmeSheet);

for (const sheet of [studentSummarySheet, reportsSheet, scoresSheet, domainsSheet, targetsSheet, answersSheet, definitionsSheet]) {
  const used = sheet.getUsedRange();
  used.format.autofitColumns();
  used.format.autofitRows();
  const columnCount = used.columnCount;
  for (let col = 0; col < columnCount; col += 1) {
    const range = sheet.getRangeByIndexes(0, col, used.rowCount, 1);
    if (range.format.columnWidth > 28) range.format.columnWidth = 28;
  }
}
dashboard.getRange("A1:M30").format.autofitRows();
readmeSheet.getRange("A1:F12").format.autofitRows();
readmeSheet.getRange("A:A").format.columnWidth = 20;
readmeSheet.getRange("B:B").format.columnWidth = 72;

wb.recalculate();
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });
const preview = await wb.render({ sheetName: "Dashboard", range: "A1:M28", scale: 1.5, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
for (const sheet of [studentSummarySheet, reportsSheet, scoresSheet, domainsSheet, targetsSheet, answersSheet, definitionsSheet, readmeSheet]) {
  const used = sheet.getUsedRange();
  const rowCount = Math.min(used.rowCount, 24);
  const colCount = Math.min(used.columnCount, 15);
  const rendered = await wb.render({ sheetName: sheet.name, range: sheet.getRangeByIndexes(0, 0, rowCount, colCount).address, scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheet.name}.png`), new Uint8Array(await rendered.arrayBuffer()));
}
const output = await SpreadsheetFile.exportXlsx(wb);
await output.save(outputPath);

const dashboardInspect = await wb.inspect({ kind: "table", range: "Dashboard!A2:F23", include: "values,formulas", tableMaxRows: 24, tableMaxCols: 8, maxChars: 12000 });
const errors = await wb.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 100 }, summary: "formula error scan" });
process.stdout.write(`${dashboardInspect.ndjson}\nERROR_SCAN\n${errors.ndjson}\nOUTPUT\n${outputPath}\nPREVIEW\n${previewPath}\n`);
