# Phase 1 初期決定記録（レビュー待ち）

## 状態

Draft。会社承認前のため、本番GAS、職場Google Drive、実PDF、実成績へ接続しない。技術仕様書v1.0と承認済み仕様変更を優先し、未決事項は次フェーズへ引き継ぐ。

## 決定一覧

| ID | 決定 | 根拠 | 影響 |
|---|---|---|---|
| ADR-P1-001 | 成績正本は通常列と版管理JSONを組み合わせる | SPEC-CHANGE-004、canonical-data-model | 検索キーと主要成績は行、可変高密度payloadは可逆JSON候補 |
| ADR-P1-002 | JSONは項目境界で分割し、再読込・件数・ハッシュ検証に合格したものだけACTIVEにする | DATAモデル、P1-E16-17 | 途中切断・欠落・改ざんを分析へ流さない |
| ADR-P1-003 | PersonIDと受験番号を分離し、本人照合状態をReportから独立して保持する | ユーザー前提、REQ-DATA-008 | 曖昧照合は単発集計のみ。自動結合しない |
| ADR-P1-004 | Parserはdetect/extract/validate/normalizeの4段階でfail-closedにする | REQ-PARSER-001-003 | 未知帳票・画像のみ・ページ異常は登録ゲートで停止 |
| ADR-P1-005 | 分析結果はADMIN専用、母数・除外・欠損を返し、小人数値を抑制する | REQ-ANALYSIS-001-004 | UI/APIが同じ抑制契約を使う |
| ADR-P1-006 | ML CSVはADMINの明示操作時だけ端末へ出し、固定列・版・欠損理由・CSV数式対策を付ける | SPEC-CHANGE-001 | Drive/GAS/CloudflareへCSV本文を保存しない |
| ADR-P1-007 | 模試追加は新Parser/SchemaVersion/PayloadFormatVersionで行い、既存版を上書きしない | 保守性、REQ-PARSER-004 | 模試・年度・第何回・帳票改訂を独立管理できる |

## 検証済み範囲

- contracts、合成fixture、payload codec、Sheet方式近似比較、分析/ML契約、Parser骨格、河合塾Schema初版、合成UI、PIIスキャンをローカル検証した。
- すべての検証入力は合成データであり、実PDFや実成績をリポジトリへ保存していない。

## レビューで決める事項

- 小人数抑制閾値（初期5案）と例外の承認者。
- 学校・大学名称マスタの責任部署と正規化ID運用。
- ML_IDのHMAC鍵ローテーションと端末保存期間。
- 実PDFスキーム差分を確認した後の河合塾SchemaVersion追加。
- GAS/Sheets実機でのセル上限、読書き時間、同時登録、分割方式。
