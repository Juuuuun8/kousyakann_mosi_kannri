# P1-T07 JSON codecと整合性試験

## 1 タスク情報

| 項目 | 内容 |
|---|---|
| タスクID | P1-T07 |
| 関連要件ID | REQ-DATA-007、REQ-DATA-010、REQ-TEST-001 |
| 状態 | Complete |
| 変更範囲 | `packages/payload-codec/**` |
| 上限 | 暫定40,000文字。実機検証後に設定化する |

## 2 目的

版管理JSONを決定的にシリアライズし、項目境界でチャンク化する。欠落・重複・不一致・破損を検知し、正本として完全復元できる基礎を用意する。

## 3 実装内容

- `canonicalJson` はオブジェクトのキーを再帰的にソートし、配列順を保持する。
- `chunkPayloadJson` はJSON文字列の途中で切らず、items単位で分割する。
- 1項目でも上限を超える場合は切り捨てずエラーにする。
- `reassemblePayloadJson` はchunkIndex、chunkCount、itemCount、共通ヘッダを検証してから復元する。
- ハッシュ計算そのものは保存アダプタの責務とし、codecはGAS・Node・ブラウザで共有可能な純粋処理にする。

## 4 受入条件

- 小payloadは1チャンクでcanonical JSONが一致する。
- 大payloadは全項目を保持したまま複数チャンクへなり、復元値が一致する。
- 欠落、重複、順序番号不正、ヘッダ混在、JSON破損をfail-closedで拒否する。
- JSONの途中切断や0点・空文字への置換を行わない。

## 5 ローカル試験

```text
npm test --prefix packages/payload-codec
```
