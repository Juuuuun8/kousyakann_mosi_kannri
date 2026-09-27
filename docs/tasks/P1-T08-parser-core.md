# P1-T08 Parser骨格

## 1 タスク情報

| 項目 | 内容 |
|---|---|
| タスクID | P1-T08 |
| 関連要件ID | REQ-PARSER-001、REQ-PARSER-003、REQ-DATA-009、REQ-TEST-001 |
| 状態 | 初版実装・契約テスト済み |
| 変更範囲 | `packages/parsers/core/**` |

## 2 固定したこと

- `detect → extract → validate → normalize` を独立結果型として扱う。
- detectがMATCHしない、SchemaVersionが一致しない、extract/validateが失敗する場合は後段へ進めない。
- ページ集合はページ番号の重複、欠落、件数不一致、文字レイヤ欠落を検出する。ページ配列の並び順には依存しない。
- 正規化結果のREADYは保存直前の段階であり、ReportをACTIVEへする処理はGAS側の再検証後に行う。

## 3 受入条件

- 未知帳票、画像のみ、ページ欠落、重複、検証不合格をfail-closedで拒否する。
- 合成入力で4段階の境界と例外処理を再現できる。
- PDF本体や外部サービスへ接続しない。
