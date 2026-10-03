// Mechanical formatting only, using the repository's pinned TypeScript dependency.
import ts from "typescript";
import { readFile, writeFile } from "node:fs/promises";
const files = ["packages/frontend-prototype/src/app.js", "packages/frontend-prototype/src/demo-model.js", "packages/frontend-prototype/src/upload.js"];
for (const file of files) {
  const source = await readFile(file, "utf8");
  const host = { getCompilationSettings: () => ({ allowJs: true }), getScriptFileNames: () => [file], getScriptVersion: () => "1", getScriptSnapshot: (name) => name === file ? ts.ScriptSnapshot.fromString(source) : undefined, getCurrentDirectory: () => process.cwd(), getDefaultLibFileName: () => "", fileExists: () => true, readFile: () => undefined };
  const service = ts.createLanguageService(host);
  const edits = service.getFormattingEditsForDocument(file, { indentSize: 2, tabSize: 2, convertTabsToSpaces: true, newLineCharacter: "\n", insertSpaceAfterCommaDelimiter: true, insertSpaceBeforeAndAfterBinaryOperators: true, insertSpaceAfterKeywordsInControlFlowStatements: true, insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true, insertSpaceBeforeTypeAnnotation: false, semicolons: ts.SemicolonPreference.Insert });
  let formatted = source;
  for (const edit of edits.sort((a, b) => b.span.start - a.span.start)) formatted = formatted.slice(0, edit.span.start) + edit.newText + formatted.slice(edit.span.start + edit.span.length);
  await writeFile(file, formatted);
  service.dispose();
}
