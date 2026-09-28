# 承認前完了レビュー 2026-09-29

## 1 結論

会社承認、外部サービス接続、追加の匿名化帳票なしに安全に実装・検証できる範囲は完了した。以前の横断レビューで未完了だったPayload hash、正本保存状態遷移、訂正・年度分割、認証service、session cookie、HMAC/replay、監査、CI、型検査、Secret/Git履歴scan、PDF登録安全UI、ML builder/filterを純粋契約と合成試験で補完した。

これは本番導入完了を意味しない。GAS/Sheets/Cloudflareに接続して初めて検証できる事項と、会社判断が必要な事項は下表に限定した。

## 2 残る外部依存

| 区分 | 未実施 | 必要な解除条件 |
|---|---|---|
| 会社判断 | 保存境界、SPEC-CHANGE-005、Cloudflare、ML端末運用、対象校舎 | 書面承認 |
| Google | 実Sheet作成、GAS、LockService、Mail/認証、backup/restore、性能 | 職場Google環境と所有者確定 |
| Cloudflare | 静的配信、HMAC中継、header、log非保持の実測 | アカウント・Secret・保持設定承認 |
| 帳票標本 | 年度/回次/0志望/未受験/印字揺れの回帰 | 個人情報をrepoへ置かない検証環境、または匿名化fixture |
| 実運用 | INPUT/ADMIN端末、同時登録、退職者失効、障害・復元訓練 | 担当者、端末、運用日程 |

## 3 ローカル検証結果

- TypeScript project: 12。
- 契約・集計・Parser・UI test: 93。
- Git履歴込みsecurity scan: 合格。
- ブラウザ: 7分析タブ、キーボード操作、ML明示確認、PDF登録fail-closed、ログイン画面、通常幅・390px幅を確認。console warning/error 0。
- 実PDF・個人情報・抽出結果・資格情報は新規保存していない。

## 4 リリース禁止条件

Phase 3の各ゲート、原票手計算照合、第三者security review、backup復元訓練が終わるまで、合成UIを本番と表示せず、登録・分析・ML downloadを利用者へ開放しない。
