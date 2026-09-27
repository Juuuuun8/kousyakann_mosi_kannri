# P1 T04 TypeScriptデータ契約

## 1 タスク情報

| 項目 | 内容 |
|---|---|
| タスクID | P1-T04 |
| タイトル | TypeScriptデータ契約とJSON Schemaの初版 |
| 関連フェーズ | Phase 1 |
| 関連要件ID | REQ-DATA-001、REQ-DATA-007、REQ-DATA-008、REQ-DATA-009、REQ-DATA-010、REQ-PARSER-001、REQ-ANALYSIS-003、REQ-EXPORT-003 |
| 状態 | Complete |
| 変更範囲 | `packages/contracts/**`、本タスク文書、トレーサビリティ |

## 2 目的

Parser、GASアダプタ、分析、ML出力が同じ識別子・状態・欠損・版管理・JSON payload契約を参照できる状態を作る。

## 3 変更してよい範囲

### 3.1 作成対象

- `packages/contracts/package.json`
- `packages/contracts/tsconfig.json`
- `packages/contracts/src/types.ts`
- `packages/contracts/src/constants.ts`
- `packages/contracts/src/validation.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/schema/*.schema.json`
- `packages/contracts/test/contracts.test.mjs`

### 3.2 変更禁止

- PDFパーサ、GAS、Cloudflare、UI
- 個人情報保存境界、権限モデル、ML列の承認済み制約
- 実PDFや実成績をfixture・テスト・ログへ追加すること
- 外部依存パッケージの追加

## 4 契約上の決定

- 受験番号は `ExamCandidateID` として模試回次内でだけ使う。
- 長期的な生徒識別にはシステム生成 `PersonID` を使う。
- `IdentityStatus` はReportの保存状態と分離する。
- 原表記、正規化値、`MissingReason`を混在させない。
- `ParserVersion`、`NormalizationVersion`、`PayloadFormatVersion`、`ExportSchemaVersion`を独立させる。
- JSON payloadは決定的JSON、40,000文字暫定ガード、チャンク単位の件数・ハッシュを前提にする。

## 5 必須テスト

- 列挙値以外のRole・Status・MissingReason・PayloadTypeを拒否する。
- Reportの必須ID、版、件数、ハッシュ形式を検証する。
- `chunkIndex < chunkCount`、`chunkCount >= 1`を検証する。
- `jsonText`がJSONとして解析でき、空文字・40,000文字超を拒否する。
- AnswerMarks tupleの要素数と正規化コードを検証する。
- Schema JSONが読み込め、代表的な合成fixtureが実行時契約ガードに適合する。外部JSON Schema validatorによる完全検証はP1-T13で行う。
- fixtureに氏名、メール、学校名、受験番号らしい実値が含まれない。

## 6 停止条件

- 型とPhase 1データモデルが矛盾する。
- 欠損の意味を一意に決められない。
- TypeScriptコンパイラが必要であるのに、実行環境を追加してよい承認がない。

本タスクではTypeScriptコンパイラや外部validatorを追加せず、Node標準テストでSchemaの構造と実行時ガードを検証する。型検査の実行はTypeScript実行環境を確定した後のP1-T13で行う。
