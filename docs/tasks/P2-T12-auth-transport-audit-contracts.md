# P2-T12 認証・通信・監査契約

## 1 管理情報

| 項目 | 内容 |
|---|---|
| タスクID | P2-T12 |
| 関連要件ID | REQ-AUTH-001〜004、REQ-SESSION-001〜002、REQ-PASSWORD-001〜003、REQ-SEC-001〜002、REQ-LOG-001〜002 |
| 仕様書参照 | 5、6.1〜6.2、6.8、9、11.1、SPEC-CHANGE-005 |
| 状態 | 純粋契約完了。認証方式承認・GAS実測・外部接続は未実施 |

## 2 実装済み契約

- Salt付きPBKDF2検証値、同一公開エラー、存在しないIDでも導出を行うtiming差低減、5回失敗ロック、初回変更ゲート。
- INPUTは登録だけ、ADMINは全閲覧・分析・ML出力、AUTH_MANAGERは継承に加え資格情報管理。失効Userは常時拒否する。
- セッションtokenは32byte乱数とし、SheetへはSHA-256だけを保存する。CookieはHttpOnly、Secure、SameSite=Strict、Path=/、有効期限付き。
- HMACはmethod、path、timestamp、nonce、body hashを結合し、期限切れ・nonce再利用・本文/署名改ざんを拒否する。
- 監査行は閉じた列契約とし、PDF、CSV、Payload、成績本文を表現できない。前行hashを含むSHA-256鎖で編集・並替え・欠落を検出する。

## 3 実装時の停止条件

- SPEC-CHANGE-005が未承認、またはOTPを維持する決定となった場合、パスワード経路を本番公開しない。
- GAS上の600,000回PBKDF2が実測上限を超える場合、回数を独断で下げず方式を再承認する。
- Users/Sessions/Auditシート以外へtoken、検証値、監査を複製しない。Cloudflare永続ストレージやログへ置かない。
- Role変更APIは作らず、権限管理シートの管理者操作に限定する。

## 4 結合必須試験

競合ログイン、ロック境界、退職者即時失効、Cookie属性、CSRF、HMAC clock skew、nonce再送、鍵rotation、監査追記失敗時の本処理停止、監査hash鎖の定期検査。
