# P2-T13 PDF登録・ML出力安全UI

## 1 管理情報

| 項目 | 内容 |
|---|---|
| タスクID | P2-T13 |
| 関連要件ID | REQ-PRIV-001〜005、REQ-AUTH-002、REQ-PARSER-003、REQ-EXPORT-001〜003、REQ-ANALYSIS-005 |
| 仕様書参照 | 5.2、6.3、6.7、7、10 |
| 状態 | 合成UI・契約完了。本番parser/API接続は承認待ち |

## 2 PDF登録

- 校舎選択を必須とし、ファイル名を画面・ログへ出さない。
- PDF bytesは`arrayBuffer`で読みSHA-256を計算した後、file inputを消去する。fetch、FormData、Web Storage、console出力を使用しない。
- parser未接続、未知Schema、画像のみ、必須ページ不足では登録ボタンを有効にしない。
- 本番接続後もextract・validateがREADYになり、利用者が校舎・模試・回次・本人情報を確認した場合だけ構造化データを送る。

## 3 ML出力

- ADMIN階層、用途入力、取扱確認、固定列検証、監査成功をすべて満たすまでBlobを生成しない。
- ACTIVEかつ本人確定済みだけを対象にし、ML_IDは秘密鍵付きHMACで生成する。氏名、メール、受験番号、PersonIDを型と列から除外する。
- filterは閉じた契約とし、未知key、空配列、重複ID、逆転期間を拒否する。
- CSV本体はDrive、GAS、Cloudflare、監査へ保存せず、端末ダウンロード処理内の一時Blobだけとする。

## 4 画面試験

7分析タブ、矢印/Home/End操作、全状態表示、ML確認ゲート、PDF登録fail-closed、ログイン非送信をブラウザで確認する。通常幅と390px幅で表示崩れ・console errorがないことを確認済み。
