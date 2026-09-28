# ADR-0001 Password認証とGAS境界

- 状態: 利用者承認済み、会社security承認待ち
- 決定日: 2026-09-29
- 対応要件: REQ-AUTH-001〜004、REQ-PASSWORD-001〜003、REQ-SESSION-001〜002、REQ-SEC-001〜002

## Context

利用者は、権限管理Sheetへ事前登録されたメールアドレスと任意passwordでINPUT/ADMINがloginできることを求めている。原仕様のメールOTP方式とは異なるため、平文passwordをSheetへ置かず、GAS URLの秘匿だけにも依存しない構成が必要である。

GAS Web Appは`doPost(e)`でPOST本文を処理でき、`Utilities.computeHmacSha256Signature`でHMAC検証できる。一方、一般的serverのような任意request headerの取得やresponse header制御に制約があり、Content Service responseは`script.googleusercontent.com`へredirectされる。また、Apps Scriptには実行時間・同時実行・MailApp等のquotaがある。

## Decision

### 1. 初期認証

- login IDは正規化したメールアドレス。
- 初期版はpassword認証とする。
- 忘れた場合はAUTH_MANAGERがresetする。
- OTPによる自己回復は将来追加可能にするが、初期版の必須機能にしない。
- INPUTは登録のみ、ADMINは全data閲覧・分析を維持する。

### 2. Password保存

- 平文、可逆暗号、hint、秘密の質問を保存しない。
- Users SheetにはAlgorithm、Salt、WorkFactor、Verifier、PasswordUpdatedAt、MustChangePassword、FailedCount、LockedUntilだけを保存する。
- KDF候補はPBKDF2-HMAC-SHA256とするが、work factorはCloudflare実測とsecurity review後に固定する。
- source codeへtest用以外のpassword、Salt、Verifierを置かない。

### 3. Password処理境界

- browserはTLSで同一originのCloudflare Functionへpasswordを送る。
- Cloudflare Functionは処理中memoryでのみpassword/KDFを扱う。
- password、derived value、Verifierをlog、KV、D1、R2、Cache、Analytics eventへ保存しない。
- verifier取得・照合protocolは、account existenceを外部から区別できず、pass-the-hashを許さない形でtask設計時に固定する。
- KDF性能、timing差、同時login、失敗時挙動を実測するまで本番採用しない。

### 4. Cloudflare→GAS

- browserへGAS URLを返さず、Cloudflare Secret/environmentからだけ参照する。
- URLが露出しても認可成立しない設計とする。
- GAS向けPOST JSON envelopeへmethod、logical path、timestamp、nonce、body、body hash、signatureを含める。
- HMAC SecretはCloudflare SecretとGAS Script Propertiesへ保持し、Git/Sheet/browser/logへ置かない。
- GASはbody size、envelope形式、timestamp、nonce、body hash、HMACを検証してからSheetへ触れる。
- signature不正、期限切れ、replayは同じ最小応答で拒否する。
- current/next Secretを持ち、無停止rotationを可能にする。

### 5. Session

- opaque session IDをCloudflareが発行し、`HttpOnly; Secure; SameSite=Strict` Cookieへ設定する。
- Sheetsにはsession ID本文ではなくhash、UserID、期限、状態だけを保存する。
- GASは全APIでsession、Users Status、Role、MustChangePasswordを再確認する。
- logout、reset、REVOKED、role変更時はsessionを失効させる。

### 6. Reset

- AUTH_MANAGERだけがresetを開始できる。
- 管理画面は新しい初期passwordからverifierを生成し、平文をSheetへ書かない。
- reset後は既存sessionを全失効し、MustChangePasswordをtrueにする。
- 初期passwordの伝達経路と本人確認方法は会社運用規程で定める。

## Security properties

- GAS URLだけではrequestを作成できない。
- GitHub/Cloudflare/Sheetのいずれにも平文passwordを永続保存しない。
- clientが送るRole、Status、保存先Sheet IDを信用しない。
- account不存在、誤password、lock、REVOKEDの公開responseを共通化する。
- login失敗回数更新はLockServiceで直列化する。

## Residual risks

- GAS URLへの直接requestによるquota消費を完全には防げない。
- Cloudflareは資格情報を一時処理するため、会社の委託・privacy承認が必要。
- 独自認証は実装不備のriskがあるため、protocol reviewとE2E security testが必須。
- AUTH_MANAGERによるreset運用は、本人確認と初期password伝達を誤ると乗っ取りにつながる。
- GAS/Sheetsは高負荷認証基盤ではない。想定利用者数と同時loginを実測する。

## Rejected alternatives

### GAS URLを秘密にするだけ

URLは漏れる前提で設計すべきであり、認証・署名の代わりにならないため不採用。

### Sheetへ平文passwordを保存

Sheet閲覧・backup・誤共有時に全accountが直ちに侵害されるため不採用。

### 初期版から毎回OTP login

MailApp quota、メール遅延、校舎業務の手数を増やすため、利用者要望に基づき初期版では不採用。将来の回復手段として拡張可能にする。

### GASだけで高反復KDF

password KDF向けの標準APIと実測根拠がなく、Apps Script実行quotaへの影響が不明なため、現時点では採用しない。

## Verification required before production

1. Cloudflare Web Cryptoで選定KDFの時間・CPU・同時loginを測る。
2. GAS direct URLへ署名なし、改ざん、期限切れ、replayを送ってSheet非接触を確認する。
3. Cloudflare/GAS/browser logにpassword、Verifier、Cookie、session IDがないことを確認する。
4. account列挙、timing差、brute force、lock競合、session fixation、CSRFを試験する。
5. Secret rotation、AUTH_MANAGER reset、退職者REVOKED、緊急失効を演習する。
6. quota監視と緊急再deploy手順を確認する。

## Official references

- https://developers.google.com/apps-script/guides/web
- https://developers.google.com/apps-script/guides/web#request_parameters
- https://developers.google.com/apps-script/guides/content#redirects
- https://developers.google.com/apps-script/reference/utilities/utilities
- https://developers.google.com/apps-script/reference/lock
- https://developers.google.com/apps-script/reference/properties
- https://developers.google.com/apps-script/guides/services/quotas
