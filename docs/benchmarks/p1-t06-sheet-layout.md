# P1-T06 Sheet方式比較

## 目的

合成データを同じ内容の行形式とJSONチャンク形式へ変換し、Google Sheetsの設計判断に使える近似値をローカルで再現する。実際のGoogle Sheets APIやGASには接続しない。

## 比較対象

- 共通: `reports`、`subject_scores` は通常列として1レコード1行。
- 行形式: `payload_items` に可変payloadの1項目を1行で格納する。
- JSON形式: `payload_chunks` にpayloadのチャンクを1行で格納し、項目境界だけで分割する。

## 指標

- `rowCount`: 対象シートの行数。
- `columnCount`: そのシートで必要な最大列数。
- `logicalCells`: `rowCount × columnCount` の矩形セル近似。API上の実セル上限を意味しない。
- `nonEmptyCells`: null、空文字を除く値の個数。
- `textCharacters`: セル値の文字数近似。JSON文字列の大きさ確認に用いる。
- `roundTripValid`: JSONチャンクを復元してcanonical JSONが一致したか。

## 設計上の扱い

このベンチマークは、JSONが常に軽いと仮定しない。`jsonMaxChars`、項目数、項目の幅を変えて測定し、完全復元でき、かつ通常列の検索性を失わない区分だけJSON候補とする。実運用のSheet列数・書込み時間・GAS制限は会社承認後の実機試験で確定する。
