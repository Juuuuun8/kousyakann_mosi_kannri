# Phase 3 承認後結合・運用計画

## 1 目的と開始条件

純粋契約・合成試験を、職場Googleアカウント所有のGAS/SheetsとCloudflare静的配信へ安全に接続し、INPUT登録からADMIN分析・ML出力までを運用可能にする。会社が保存境界、認証方式、ML端末保存、Cloudflare条件、対象校舎を承認するまでは開始しない。

## 2 実装順とゲート

| 順序 | タスク | 主成果 | 合格しない場合 |
|---:|---|---|---|
| 1 | P3-T01 環境・所有権台帳 | 所有者、管理者、Sheet/GAS/Cloudflare環境、Secret rotation責任 | 接続しない |
| 2 | P3-T02 Sheet作成・移行 | Users、Sessions、Reports、Scores、Payload、Audit、FileRegistryの版付きschema | 書込APIを公開しない |
| 3 | P3-T03 GAS保存アダプタ | Lock、重複、訂正、readback hash、年度分割、rollback/retry | ACTIVEへ遷移しない |
| 4 | P3-T04 認証・Session | 承認済み認証、Cookie、CSRF、失効、rate limit | 分析APIを公開しない |
| 5 | P3-T05 HMAC中継 | HMAC、nonce、clock skew、no-store、秘密情報非logging | Cloudflare経路を公開しない |
| 6 | P3-T06 browser PDF接続 | 固定版self-hosted pdf.js、memory-only抽出、確認画面、unknown拒否 | 登録を許可しない |
| 7 | P3-T07 分析API/UI接続 | 全校舎分析、個人詳細、品質・除外・抑制、訂正時cache失効 | 合成表示を本番表示へ切替えない |
| 8 | P3-T08 ML一時出力 | 監査先行、固定列、Blob破棄、端末運用確認 | downloadを許可しない |
| 9 | P3-T09 Backup/Restore | Drive内世代管理、復元訓練、hash照合 | 本番判定しない |
| 10 | P3-T10 受入・負荷・引継ぎ | INPUT/ADMIN E2E、同時登録、上限、退職者、障害訓練 | 稼働開始しない |

各タスクは前段の成果を再利用し、列名・権限・保存境界を変更する場合は仕様変更提案へ戻す。

## 3 横断エッジケース

- 同じPDFの二重click、複数校舎からの同時登録、応答喪失後の再送、書込途中のGAS timeout。
- 同姓同名、氏名表記揺れ、受験番号再利用、本人不確定、訂正連鎖、別人PDFページ混在。
- 第何回・年度・提供元のschema変更、科目追加/廃止、満点変更、0志望、未受験、非掲載、画像PDF。
- 年度境界、容量閾値直前、archived file、バックアップ中の書込、復元後の監査hash鎖。
- 退職・権限変更中のsession、複数タブ、clock skew、nonce再送、Secret rotation前後のin-flight request。
- 小人数群、filter組合せによる再識別、抑制後の別集計差分攻撃、CSV数式注入、巨大export、download中断。

## 4 データ移行・ロールバック

- すべてのSheet schemaへSchemaVersionとMigrationIDを付け、移行前backup、件数、hash、sample再読込を記録する。
- 書込APIは旧新schema混在を拒否する。移行失敗時は新fileを破棄せず隔離し、台帳参照を旧fileへ戻す。
- Cloudflare/GASは一つ前の互換版へ戻せる単位でreleaseし、データ列削除をrollback手段にしない。

## 5 稼働判定証跡

承認記録、環境台帳、テスト結果、負荷測定、復元訓練、脆弱性レビュー、操作手順、障害手順、退職者失効手順、既知制約を一つのrelease checklistへ集約する。実PDFや個人成績は証跡へ添付しない。
