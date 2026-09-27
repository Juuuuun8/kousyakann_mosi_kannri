# P1-T06 Sheet方式比較

## 1 タスク情報

| 項目 | 内容 |
|---|---|
| タスクID | P1-T06 |
| 関連要件ID | REQ-DATA-007、REQ-DATA-010、REQ-TEST-003 |
| 状態 | Complete |
| 変更範囲 | `packages/sheet-benchmark/**`、`docs/benchmarks/p1-t06-sheet-layout.md` |
| 本番接続 | 禁止 |

## 2 目的

同一の合成データを、検索しやすい通常行と、可変・高密度情報を項目境界でまとめるJSONチャンクへ変換し、セル数近似、非空セル数、文字数、完全復元を比較する。

## 3 重要な前提

- `logicalCells` は行数×最大列数のローカル近似であり、Google Sheetsの実機上限ではない。
- JSONを軽いと仮定せず、チャンク上限とデータ量を変えて測定する。
- Report・科目成績は通常列に残し、JSON対象は設問別・分野別などの可変payloadに限定する。
- 実機のGAS書込み時間・容量・承認後運用は別フェーズで測定する。

## 4 受入条件

- 行形式とJSON形式の同じ入力について比較値を返す。
- JSONチャンクを復元したcanonical JSONが入力と一致する。
- チャンク上限が不正な場合に拒否する。
- 実データやGoogleサービスへ接続しない。

## 5 ローカル試験

```text
npm test --prefix packages/sheet-benchmark
```
