# P1-T11 ML CSV契約

## 1 タスク情報

| 項目 | 内容 |
|---|---|
| タスクID | P1-T11 |
| 関連要件ID | REQ-EXPORT-001、REQ-EXPORT-002、REQ-EXPORT-003、REQ-TEST-001 |
| 状態 | Complete |
| 変更範囲 | `packages/export-contracts/**` |
| 保存 | CSVファイルをリポジトリ・Drive・GASへ保存しない |

## 2 固定したこと

- ExportSchemaVersionと列順を固定し、直接識別子・PersonID・学校名・クラス・校内番号を列へ入れない。
- `RESOLVED`または`NEW_CONFIRMED`のReport相当だけを出力対象にする。
- MissingReason、ParserVersion、PayloadFormatVersionを出力し、0埋めを既定にしない。
- ADMIN、目的、日時、対象条件、件数、列集合は別の監査レコードへ渡せる形にする。CSV本文は監査対象に含めない。
- CSVセルを常に引用し、文字列の`= + - @`等で始まる値をアポストロフィで保護する。

## 3 受入条件

- 不確定本人、禁止列、重複観測、版不一致を拒否する。
- 固定ヘッダと行列数が一致する。
- CSV serializerはブラウザ一時Blobでの利用を想定し、永続保存やネットワーク送信を行わない。
