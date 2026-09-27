# 仕様トレーサビリティ

## 1 運用方法

各要件へ安定した要件IDを付与し、フェーズ計画、Lunaタスク、テスト、実装を追跡する。仕様書の文章をこの文書で置き換えない。解釈が衝突した場合は仕様書を優先する。

## 2 初期要件一覧

| 要件ID | 仕様書 | 要件概要 | Phase 0成果物 | 検証 |
|---|---|---|---|---|
| REQ-ARCH-001 | 4 | ブラウザ、Cloudflare、GAS、Driveの責任を分離する | privacy-boundary.md | 境界レビュー |
| REQ-OWN-001 | 2.3, 4.1 | GAS、Drive、Sheetsは職場PC Googleアカウントを所有主体とする | privacy-boundary.md | 所有者確認 |
| REQ-PRIV-001 | 2.1, 10.2 | PDF本体を外部サーバーへ送信・保存しない | privacy-boundary.md | ネットワーク試験 |
| REQ-PRIV-002 | 10.2 | 個人情報の正本をGoogle DriveとSheetsへ集約する | privacy-boundary.md | 保存先監査 |
| REQ-PRIV-003 | 6.3, 10.2 | PDF・抽出全文をWeb Storageへ保存しない | privacy-boundary.md | 静的検査・ブラウザ試験 |
| REQ-PRIV-004 | 10.3 | API応答をno-storeとする | privacy-boundary.md | ヘッダー試験 |
| REQ-PRIV-005 | 10.3 | pdf.jsを固定版で自前配信する | phase-plan | ビルド成果物監査 |
| REQ-AUTH-001 | 5 | INPUT、ADMIN、AUTH_MANAGERの権限継承を実装する | traceability.md | 権限マトリクス試験 |
| REQ-AUTH-002 | 5.2, 6.4 | INPUTは登録のみで閲覧不可とする | traceability.md | API拒否試験 |
| REQ-AUTH-003 | 5.2 | 全APIでGASがUsersのRoleとStatusを確認する | traceability.md | API認可試験 |
| REQ-AUTH-004 | 6.8 | 権限変更APIをWebアプリへ実装しない | traceability.md | API一覧監査 |
| REQ-OTP-001 | 6.1, 9.1 | ACTIVE利用者だけへOTPを送る | traceability.md | 認証試験 |
| REQ-SESSION-001 | 6.2, 9.2 | セッションIDをHttpOnly Secure SameSite Strict Cookieに置く | privacy-boundary.md | Cookie試験 |
| REQ-SESSION-002 | 新規制約 | 利用者と結び付くOTP・セッション状態を所定のGoogle Sheets以外へ保存しない | privacy-boundary.md, SPEC-CHANGE-002 | 保存先監査 |
| REQ-PARSER-001 | 6.3, 7.1 | Parserをdetect extract validate normalizeに分離する | phase-plan | 契約試験 |
| REQ-PARSER-002 | 7.1 | ParserVersionを成績レコードへ保存する | traceability.md | 保存試験 |
| REQ-PARSER-003 | 6.3, 7.1 | 未知スキームをfail-closedで拒否する | traceability.md | 未知PDF試験 |
| REQ-PARSER-004 | 6.12 | 新旧スキームの回帰試験を行う | phase-plan | ゴールデンテスト |
| REQ-DATA-001 | 6.4, 8.3 | RecordID、ImportedBy、ImportedAt、ParserVersion、PdfHash等を保存する | traceability.md | 列・保存試験 |
| REQ-DATA-002 | 6.4 | 保存先Spreadsheet IDをクライアントから受け取らない | privacy-boundary.md | 改ざん試験 |
| REQ-DATA-003 | 6.9 | 訂正は履歴を保持し元レコードを通常削除しない | traceability.md | 訂正試験 |
| REQ-DATA-004 | 6.10, 8.2 | 年度と容量に応じてGASが保存先を自動作成・分割する | traceability.md | 分割試験 |
| REQ-DATA-005 | 6.4 | 重複Fingerprintを検知する | traceability.md | 二重登録試験 |
| REQ-DATA-006 | 6.4 | LockServiceで同時書込を制御する | traceability.md | 競合試験 |
| REQ-ANALYSIS-001 | 6.5, 6.6 | ADMIN以上だけが閲覧・分析できる | traceability.md | 権限試験 |
| REQ-ANALYSIS-002 | 6.6 | 分析不要な直接識別子を返さない | privacy-boundary.md | API項目試験 |
| REQ-EXPORT-001 | 6.7 | ML出力から氏名・メール等を除外する | privacy-boundary.md | 出力列試験 |
| REQ-EXPORT-002 | 6.7 | ML_IDを匿名化ではなく仮名化として扱う | privacy-boundary.md | 文言・運用監査 |
| REQ-EXPORT-003 | 承認済み例外 | ADMINの明示操作に限り直接識別子除外済みML用CSVを端末へ保存できる | privacy-boundary.md, SPEC-CHANGE-001 | 権限・出力列・監査試験 |
| REQ-DATA-007 | 承認済み方針 | 情報損失なく復元検証できる高密度データは版管理JSONとしてGoogle Sheetsセルへ正本保存できる | privacy-boundary.md, SPEC-CHANGE-004 | 復元・ハッシュ・上限試験 |
| REQ-LOG-001 | 11.1 | 成功・失敗・操作種別・RequestIDを監査記録する | privacy-boundary.md | ログ試験 |
| REQ-LOG-002 | 6.1, 11.1 | OTP、セッションID、Secret、PDF本文をログへ出さない | privacy-boundary.md | 禁止値試験 |
| REQ-BACKUP-001 | 6.11, 11.2 | Drive内で定期バックアップし世代管理する | traceability.md | バックアップ試験 |
| REQ-SEC-001 | 9.3 | CloudflareからGASへの通信をHMAC署名する | traceability.md | 署名試験 |
| REQ-SEC-002 | 9.3 | timestampとnonceでリプレイを防止する | traceability.md | 再送試験 |
| REQ-SEC-003 | 6.4 | 数式注入を防止する | traceability.md | 不正文字列試験 |
| REQ-OPS-001 | 13, 14 | 開発担当変更時に所有権とSecretを移管できる | phase-plan | 引継ぎ訓練 |
| REQ-TEST-001 | 15.1 | 機能・権限・未知PDF・重複・退職者等を受入試験する | phase-plan | テスト報告 |
| REQ-TEST-002 | 15.2 | HMAC、Role改ざん、保存先改ざん、Cookie、ログを試験する | phase-plan | セキュリティ試験 |
| REQ-TEST-003 | 15.3 | 同時登録、GAS時間、Cloudflare CPU、OTP上限を試験する | phase-plan | 負荷試験 |

## 3 トレーサビリティ更新規則

- 新規要件は既存IDを再利用せず、新しいIDを発行する。
- 要件削除は行削除ではなく廃止理由を記録する。
- 各Lunaタスクは1つ以上の要件IDを参照する。
- 各要件は1つ以上の受入テストへ対応させる。
- パーサ固有要件は提供元、模試種別、SchemaVersionを識別できるID体系にする。
- 仕様書改訂時は影響要件、計画、コード、テストを同時に点検する。
