# 模試成績PDF取込・分析システム

河合塾の模試成績PDFをブラウザ内で解析し、Google Apps Scriptを経由してGoogle Sheetsへ保存し、権限に応じた分析を提供する社内システムです。

## 現在の状態

会社承認前の設計・準備段階です。本番GAS、職場Google Drive、実データには接続しません。初期対象帳票Parser、分析集計、正本保存・認証・通信・監査・ML出力の純粋契約、合成UI、CI品質ゲートまでを実装済みです。外部サービスへ接続するアダプタは承認後タスクとして分離しています。

## 最上位の制約

- 個人情報の永続保存先は、原則として職場PC Googleアカウントが所有するGoogle Drive上の非共有Google Sheetsだけとする。
- 例外として、ADMINが明示操作したML用CSVだけは、直接識別子を除外し監査記録を残したうえで利用者端末へ保存できる。
- PDF本体はブラウザ内で一時的に解析し、Cloudflare、GitHub、GAS、Google Driveへ保存しない。
- GitHubへ実PDF、実成績、仕様書本体、画面キャプチャ、ログ、エクスポートを置かない。
- Cloudflareは静的配信と一時的なAPI中継に限定し、個人情報をKV、D1、R2、Cache、ログ等へ保存しない。
- 情報損失なく復元検証できる場合、設問別成績等を版管理されたJSONとしてGoogle Sheetsセルへ正本保存できる。
- INPUTは登録のみ、ADMINは全データ閲覧・分析を可能とする。
- 未知または検証不合格のPDFは登録しない。
- 分析は指導対象・指導内容を自動決定せず、講師・社員が判断するための分布、比較、時系列、設問結果、志望校判定、品質情報を提示する。
- パスワード認証は仕様変更提案中であり、平文をSheetへ保存しない契約・合成UIだけを先行実装する。

## 計画文書

- [Phase 0 開発統制と仕様トレーサビリティ](docs/plans/phase-0-governance-and-traceability.md)
- [Phase 1 分析要件と正本データ契約](docs/plans/phase-1-analysis-and-data-contract.md)
- [河合塾帳票と既存試作のギャップ分析](docs/reviews/kawai-sample-and-prototype-gap-analysis.md)
- [分析要件カタログ](docs/design/analysis-catalog.md)
- [Google Sheets正本データモデル案](docs/design/canonical-data-model.md)
- [P1-T04 TypeScriptデータ契約](docs/tasks/P1-T04-type-contract.md)
- [P1-T05 合成データ生成器](docs/tasks/P1-T05-synthetic-fixtures.md)
- [P1-T06 Sheet方式比較](docs/tasks/P1-T06-sheet-benchmark.md)
- [P1-T07 JSON codecと整合性試験](docs/tasks/P1-T07-payload-codec.md)
- [P1-T06 ベンチマーク設計](docs/benchmarks/p1-t06-sheet-layout.md)
- [P1-T08 Parser骨格](docs/tasks/P1-T08-parser-core.md)
- [P1-T09 河合塾Schema初版](docs/tasks/P1-T09-kawai-schema.md)
- [P2-T01 河合塾ページ判定・科目成績抽出](docs/tasks/P2-T01-kawai-parser-page1.md)
- [P2-T02 河合塾分野別成績抽出](docs/tasks/P2-T02-kawai-domain-results.md)
- [P2-T03 河合塾志望校別成績抽出](docs/tasks/P2-T03-kawai-target-schools.md)
- [P2-T04 河合塾解答明細抽出](docs/tasks/P2-T04-kawai-answer-marks.md)
- [P2-T05 河合塾ページ1残項目・READYゲート](docs/tasks/P2-T05-kawai-page1-details-and-ready-gate.md)
- [P1-T10 分析クエリ契約](docs/tasks/P1-T10-analytics-contracts.md)
- [P2-T06 P0科目分析集計エンジン](docs/tasks/P2-T06-subject-analytics-engine.md)
- [P2-T07 Payload分析集計とUI接続](docs/tasks/P2-T07-payload-analytics-and-ui-binding.md)
- [P2-T08 同一受験者回次比較と判断材料UI](docs/tasks/P2-T08-subject-comparison-and-evidence-ui.md)
- [P2-T09 分野回次比較](docs/tasks/P2-T09-domain-comparison.md)
- [P1-T11 ML CSV契約](docs/tasks/P1-T11-export-contracts.md)
- [P1-T13 PIIスキャン初版](docs/tasks/P1-T13-security-pii-scan.md)
- [P1-T12 合成UIワイヤーフレーム](docs/tasks/P1-T12-frontend-prototype.md)
- [AUTH-T01 パスワード認証契約](docs/tasks/AUTH-T01-password-contract.md)
- [P2-T10 CI・型・セキュリティ品質ゲート](docs/tasks/P2-T10-ci-security-quality-gates.md)
- [P2-T11 正本保存整合性・年度分割契約](docs/tasks/P2-T11-storage-integrity-and-file-routing.md)
- [P2-T12 認証・通信・監査契約](docs/tasks/P2-T12-auth-transport-audit-contracts.md)
- [P2-T13 PDF登録・ML出力安全UI](docs/tasks/P2-T13-input-and-export-safety-ui.md)
- [Phase 3 承認後結合・運用計画](docs/plans/phase-3-integration-and-operations.md)
- [承認前完了レビュー 2026-09-29](docs/reviews/preapproval-completion-review-2026-09-29.md)
- [Phase 1 初期決定記録（レビュー待ち）](docs/decisions/phase-1-initial-decisions.md)
- [実装横断レビュー 2026-09-28](docs/reviews/implementation-review-2026-09-28.md)
- [個人情報の保存境界](docs/security/privacy-boundary.md)
- [仕様トレーサビリティ](docs/requirements/spec-traceability.md)
- [仕様変更提案](docs/changes/spec-change-proposals.md)
- [フェーズ実装計画書テンプレート](docs/templates/phase-plan-template.md)
- [Luna実装タスクテンプレート](docs/templates/luna-task-template.md)
- [ADRテンプレート](docs/templates/adr-template.md)

## 実装開始条件

各フェーズは、フェーズ計画書、例外一覧、テスト計画、受入条件が承認されるまで実装を開始しません。仕様書にない設計判断はADRまたは仕様変更提案として記録します。

原本仕様書はリポジトリ外の承認済み文書を参照します。Lunaへ渡す各タスクには、該当する仕様書の章・要件ID・必要な原文抜粋または参照可能な原本パスを含めます。
