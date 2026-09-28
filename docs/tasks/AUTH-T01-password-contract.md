# AUTH-T01 パスワード認証契約

## 1 タスク情報

| 項目 | 内容 |
|---|---|
| タスクID | AUTH-T01 |
| 関連要件ID | REQ-AUTH-001〜004、REQ-PASSWORD-001〜003、REQ-SESSION-001〜002 |
| 状態 | 契約・合成テスト完了。本番アダプタは承認待ち |
| 仕様差分 | SPEC-CHANGE-005 |
| 変更範囲 | `packages/auth-contracts/**`、`packages/frontend-prototype/login.html` |

## 2 実装済み

- INPUT、ADMIN、AUTH_MANAGERとACTIVE、REVOKEDを型・実行時検証する。
- PASSWORD、OTP_ONLY、PASSWORD_WITH_OTP_RECOVERYを表現する。
- 平文・可逆パスワード列を許さないUsers行の完全列契約を検証する。
- PBKDF2-HMAC-SHA256、600,000回、ランダム16-byte Salt、32-byte VerifierをWeb Cryptoで導出する。
- メール正規化、15〜128文字のパスワード、5回失敗・15分ロックの方針定数を持つ。
- 固定時間比較の補助関数と、保存・送信をしないログイン表示プロトタイプを持つ。

## 3 次タスク開始条件

- 会社がSPEC-CHANGE-005と初期パスワード伝達・再設定・退職者失効の運用を承認する。
- GAS上でPBKDF2 600,000回の単発・同時実行時間を実測し、反復回数を確定する。
- Users、Sessions、監査ログのシート列と共有範囲をレビューする。
- Cloudflare/GAS間、Cookie、CSRF、レート制限の具体設計を承認する。

## 4 本番アダプタの受入条件

- 管理者はSheetセルへパスワードを直接入力しない。保護された設定画面だけから初期設定・再設定する。
- ロック更新と成功時解除はLockServiceで原子的に行う。
- ID不存在時もダミーSalt・Verifierで同等処理を行い、公開応答と概ねの処理時間を揃える。
- Role、Status、mustChangePasswordを各APIで再評価する。
- INPUTの分析・閲覧、ADMIN以外のML出力、Webからの権限変更APIを拒否する。
- パスワード、Verifier、Salt、OTP、セッションIDをログへ出さない。
