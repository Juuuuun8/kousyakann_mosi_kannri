# GAS runtime

会社承認後に職場Google accountのstandalone Apps Scriptへ配置するsourceです。現時点では外部GASへdeployしません。

## Required Script Properties

- `MANAGEMENT_SPREADSHEET_ID`
- `HMAC_SECRET_CURRENT`
- `HMAC_SECRET_NEXT`（rotation中だけ）
- `DUMMY_PASSWORD_SALT`
- `DUMMY_PASSWORD_VERIFIER`
- `DUMMY_PASSWORD_ITERATIONS`

値はGitHub、Sheet、Cloudflareの平文変数へcommitしません。HMAC secretはCloudflare側secretと一致させます。dummy credentialは実accountと同じKDF条件で生成します。

## Bootstrap

1. 職場Google accountで非共有Spreadsheetとstandalone Apps Scriptを作成する。
2. Script Propertiesを設定する。
3. editorから`ensureSchema()`を一度実行する。
4. UsersとLocationsを管理者が登録する。password平文は入力しない。
5. Web Appを実行者=deploy user、access=anonymousとしてdeployする。
6. URLをCloudflareの`GAS_ENDPOINT` secretへ設定する。
7. 署名なしrequestが`REQUEST_REJECTED`になり、Sheet行数が変化しないことを確認する。

`ANYONE_ANONYMOUS`はCloudflareからOAuthなしで到達させるために必要です。URLの秘密性を認証として使わず、HMAC、timestamp、nonce、body hashをSheet access前に検証します。

## Current implementation boundary

署名、replay拒否、schema初期化、password challenge/complete、lockout、session、role再確認、logoutまで実装済みです。登録、分析、ML、credential resetは明示的に`NOT_IMPLEMENTED`でfail-closedします。これらを実装するまでは本番利用不可です。
