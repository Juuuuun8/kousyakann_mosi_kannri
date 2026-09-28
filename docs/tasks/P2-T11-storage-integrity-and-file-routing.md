# P2-T11 正本保存整合性・年度分割契約

## 1 管理情報

| 項目 | 内容 |
|---|---|
| タスクID | P2-T11 |
| 関連要件ID | REQ-DATA-001〜010、REQ-PRIV-002、REQ-SEC-003 |
| 仕様書参照 | 6.4、6.9、6.10、7、8、10.2 |
| 状態 | 純粋契約完了。本番GASアダプタは承認待ち |

## 2 書込不変条件

1. Report、SubjectScore、Payloadの件数・ReportID・SchemaVersionを保存前に照合する。
2. Payloadはチャンク単位と全体のSHA-256を保持し、欠落・重複・順序違い・改ざん・別Report混入を拒否する。
3. 書込順は`PENDING Report → Score → Payload → 再読込検証 → ACTIVE`とし、検証前のReportを分析へ出さない。
4. 完全重複は既存結果を返し、意味重複はレビューへ送る。訂正時は既存ACTIVEをSUPERSEDEDへ遷移し、削除しない。
5. 保存先IDはサーバー側台帳から年度・連番・容量で選び、クライアント入力を型として受け付けない。
6. 容量閾値到達前に現ファイルをARCHIVEDとし、次の年度partを作成する。

## 3 必須異常系

- Subject/Payload件数不一致、異なるReportID、未知payload type、正規化ID欠落、raw全文混入。
- 同じFingerprintの並行登録、片方だけの書込成功、再試行、訂正対象が非ACTIVE、訂正の連鎖。
- チャンク欠落・重複・改ざん、read-after-write不一致、閾値直前の並行書込。

## 4 承認後の結合条件

GASではLockServiceを取得してから重複判定・保存先選定・書込・再読込・状態遷移を一つの臨界区間で実行する。タイムアウト時はPENDINGを残して監査し、自動的にACTIVE扱いしない。
