# P1-T05 合成データ生成器

## 1 タスク情報

| 項目 | 内容 |
|---|---|
| タスクID | P1-T05 |
| 関連要件ID | REQ-PARSER-001、REQ-DATA-007、REQ-DATA-009、REQ-TEST-001 |
| 状態 | Complete |
| 変更範囲 | `packages/test-fixtures/**` |
| 実データ | 使用しない |

## 2 目的

実在の生徒・学校・受験番号を含めず、模試回次、校舎、本人照合状態、科目成績、設問別正誤、分野別成績、欠損を含む決定的なfixtureを生成する。Parser、codec、Sheet方式比較、分析契約の共通入力として使用する。

## 3 実装内容

- `makeSyntheticDataset` がReport、SubjectScore、PayloadとReport/科目への結び付きを生成する。
- UUID、SHA-256形式、版、欠損理由、PersonIDを契約に適合させる。
- 値未取得を0点へ変換せず、`MissingReason`を持つnullとして表現できることを試験する。
- 生成結果の決定性と既知のサンプル個人情報トークン不在を試験する。

## 4 受入条件

- 同じオプションから同じfixtureが生成される。
- contractsのReport、SubjectScore、Payload実行時検証に合格する。
- payload項目の順序とReportID・SubjectIDの対応を失わない。
- 実在帳票・実成績・氏名・メール・受験番号をfixtureへ持ち込まない。

## 5 ローカル試験

```text
npm test --prefix packages/test-fixtures
```

本番PDF、GAS、Google Sheetsには接続しない。
