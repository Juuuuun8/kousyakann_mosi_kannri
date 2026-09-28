# Phase 3 本番結合・受入・運用 詳細実装計画 v2

- 作成日: 2026-09-29
- 状態: 利用者承認済み（2026-09-29）。個別の会社承認事項は未承認
- 対象: 会社承認後のCloudflare Pages/Functions、GAS、Google Sheets結合とpilot
- 前提: `spec-implementation-audit-2026-09-29.md`のP0を解消する
- 旧計画: `phase-3-integration-and-operations.md`を詳細化し、本書を優先する

## 1. 実行規則

1. 原本仕様書、承認済み仕様変更、利用者の明示要望を毎taskで照合する。
2. 外部サービスの作成、削除、公開、権限変更、secret投入は、操作直前に利用者へ対象と影響を示して共同実施する。
3. 実装担当がLunaでも迷わない粒度まで、task開始前に入力、出力、禁止事項、例外、テストを固定する。
4. 実データは職場Google Driveの非共有Google Sheets以外へ永続保存しない。
5. PDF本文をCloudflare、GAS、GitHub、Driveへ送らない。
6. 未知Schema、欠落、hash不一致、認可不明、部分失敗はfail-closedとする。
7. 実装完了と受入完了を分ける。講師・社員のfeedbackと責任者承認なしに次gateへ進まない。

## 2. 全task共通の実装票

Lunaへ渡す各taskは、少なくとも次を埋める。

- Task ID、目的、対象要件ID、仕様書章
- 前提条件と未決事項
- 変更対象fileと、変更してはいけないfile
- API input/output、Sheet列、role、status遷移
- 正常系、境界値、例外、競合、再試行、timeout
- 個人情報の通過点・保存先・log禁止値
- unit/integration/E2E/manual test
- 完了証跡と受入基準
- rollback方法とデータ互換性
- feedback対象者、質問、記録先
- 実装開始gate、完了gate、停止条件

## 3. Gate一覧

| Gate | 通過条件 | 承認者 |
|---|---|---|
| G0 要求確定 | 認証、role、本人照合、保持期間、所有者、Cloudflare利用を決定 | 業務責任者・情報管理責任者 |
| G1 環境準備 | Git/Cloudflare/Googleの所有・権限・台帳が確認済み | system owner |
| G2 sandbox結合 | 合成データだけで全経路と障害復旧を合格 | 開発責任者 |
| G3 帳票pilot | 許可済み匿名化帳票でparserと保存を合格 | 帳票担当・講師代表 |
| G4 業務UAT | role別操作、分析有用性、手順を合格 | INPUT/ADMIN代表 |
| G5 security/ops | 脅威、負荷、backup/restore、引継ぎを合格 | 情報管理責任者 |
| G6 本番 | release checklistと残余riskを承認 | 会社責任者 |

## 4. Phase 3A: 要求再確定とfeedback設計

### P3A-T01 仕様v1.1決定表

- 要件: 全要件、SPEC-CHANGE-001〜005
- 決める事項:
  - OTP_ONLYかPASSWORD_WITH_OTP_RECOVERYか
  - 平文password禁止とverifier方式
  - AUTH_MANAGERを独立roleにするか、管理者のSheet直接編集に限定するか
  - ADMINが氏名を常時見られるか、個人画面でだけ見られるか
  - PersonID統合・分離の承認者
  - 保持期間、卒業・退塾後削除、backup世代
  - RPO、RTO、保守時間、障害連絡先
  - Cloudflare/GitHub/Googleの本番owner、副owner、請求
- edge case: 退職、メール変更、改姓、同姓同名、管理者不在、会社承認撤回
- test/evidence: 決定log、改訂差分、責任者名、承認日
- feedback: 業務責任者、情報管理、実際のINPUT/ADMIN各1名以上へ説明し、異論を記録
- gate: 未決項目が1つでもsecurity/data modelを変える場合、後続実装を止める

### P3A-T02 教育分析feedback workshop

- 目的: 「何を表示できるか」ではなく「どの判断材料が不足するか」を検証する。
- 参加者: 校舎責任者、教科担当、進路担当、事務担当を可能なら3〜5名。
- scenario:
  1. 校舎全体の弱点を把握する
  2. 学校別の違いを比較する
  3. 同一生徒の回次変化を見る
  4. 科目→分野→設問へ原因候補を掘る
  5. 志望校判定とborder差を見る
  6. 欠損・未受験・小人数抑制を誤解せず判断する
- 質問: 次の行動を考える材料が揃ったか、誤解する表示はないか、不要な指標は何か、追加filterは何か。
- 記録: 指摘、根拠、対象画面、優先度、採否、理由、決定者。
- 受入: P0の誤解・不足なし。P1はbacklogと期限を合意。

### P3A-T03 threat model・privacy review

- 対象: browser、Pages、Functions、GAS、Sheets、Drive、GitHub、端末CSV。
- threat: credential盗用、CSRF、XSS、replay、権限昇格、ログ漏洩、preview漏洩、差分攻撃、CSV流出、secret流出、供給網、退職者、誤共有。
- 出力: data flow、trust boundary、risk owner、mitigation、残余risk、incident連絡。
- feedback: 情報管理担当に保存場所だけでなく処理・log・委託先も確認してもらう。
- gate: 未受容のP0/P1 riskがあればG1へ進まない。

## 5. Phase 3B: 所有・環境・配備基盤

### P3B-T01 環境台帳と所有権

- 記録: GitHub repo、Cloudflare account/project、Google account、Drive folder、GAS project、Sheet IDs、owner、副owner、用途、production/sandbox。
- 禁止: password、secret、個人成績を台帳へ書かない。
- edge case: owner退職、2FA紛失、請求停止、共有解除。
- test: 副ownerによるread-only確認、引継ぎdry run。
- rollback: 新環境作成前に既存空projectの残置/削除を利用者が決定。

### P3B-T02 Cloudflare GitHub App共同設定

- 利用者操作:
  1. GitHubで`Cloudflare Workers and Pages`をInstall/Configure
  2. `Only select repositories`
  3. 対象repoだけ許可
- 共同確認: account、repo、production branch=`main`、build=`npm run build:demo`または本番build、output=`dist`。
- preview: 原則無効化またはAccess保護。production secretをpreviewへ設定しない。
- 禁止: 全repo許可、個人情報入りbranch、secretのGit commit。
- test: 合成変更のpushでbuild、preview/productionの公開範囲、rollback。
- rollback: GitHub Appのrepo access解除、build disconnect。利用者承認なしに実行しない。

### P3B-T03 Cloudflare config標準化

- 現在の`wrangler.toml`を、実装開始時点の公式推奨に合わせて`wrangler.jsonc`へ移行するかADRで維持理由を記録。
- 固定: compatibility date、Pages output、no KV/D1/R2/Cache binding、observability/log本文禁止。
- headers: CSP、frame denial、nosniff、referrer、permissions、API no-store。
- test: production/preview両方の実response header。
- stop: 未承認のCloudflare resource bindingを見つけたら停止。

### P3B-T04 Google sandbox資源作成

- 職場Google accountで専用Drive folder、管理台帳Sheet、sandboxデータSheet、GAS projectを作る。
- 共有: ownerと承認済み保守者だけ。link sharing禁止。
- Script Properties: Sheet IDs、HMAC current/next key、ML pseudonym key、環境名。
- 禁止: repository、Cloudflare env、browserへSheet ID一覧を返すこと。
- test: 権限外accountの拒否、誤共有scan。
- gate: 会社承認前はコード準備までとし、実資源作成しない。

## 6. Phase 3C: Google Sheets schema・migration・adapter

### P3C-T01 Schema定義とmigration runner

- sheets: Settings、Users、Sessions、OtpChallenges、Persons、IdentityLinks、DataFiles、Reports、SubjectScores、PayloadChunks、Targets、AuditLog、BackupLog。
- 各Sheet: SchemaVersion、MigrationID、固定header、型、nullable、enum、unique key、index代替列、保護範囲を定義。
- migration: backup→precheck→apply→count/hash/readback→commit。途中失敗は隔離し旧registryを維持。
- edge case: 列順変更、手編集列、重複header、旧version、途中timeout、容量上限。
- test: 新規作成、再実行冪等、1世代/複数世代upgrade、失敗rollback。

### P3C-T02 実保存adapter

- flow: request id→LockService→role再確認→duplicate確認→PENDING→normal rows/payload chunks→readback/hash→ACTIVE→audit。
- idempotency: request IDとsemantic fingerprintを別管理。
- timeout: PENDINGをACTIVE扱いしない。再試行は同じidempotency keyで継続または隔離。
- formula injection: Sheetへ書く文字列も先頭危険文字を安全化。
- test: 同時10件、同一PDF二重送信、別PDF同一内容、chunk欠落、write失敗、readback不一致、lock timeout。

### P3C-T03 年度・part routing

- GASだけがDataFiles registryを参照し、年度/模試/partを選ぶ。client指定を拒否。
- 容量閾値前に次partを作成し、旧fileはarchived read-only扱い。
- edge case: 年度跨ぎ、同時作成、作成失敗、registryだけ更新、共有権限継承漏れ。
- test: 境界直前/直後、同時作成、archive参照、復旧。

### P3C-T04 訂正・Person統合分離

- 訂正: 原レコードを削除せずSUPERSEDED、ReplacementID、理由、操作者、日時を保持。
- Person: MATCH_PENDING、CONFIRMED、MERGED、SPLITを履歴化。受験番号や氏名だけで自動確定しない。
- analytics/ML: CONFIRMED identityとACTIVE reportだけを既定対象。
- feedback: 実際の同姓同名・改姓・転校scenarioを校舎担当と机上演習。
- test: 誤統合の分離、統合後訂正、回次比較再計算、監査chain。

## 7. Phase 3D: 認証・認可

### P3D-T01 認証方式の採用ADR

- OTP_ONLYとPASSWORD_WITH_OTP_RECOVERYを、security、運用負荷、GAS quota、失効、回復で比較。
- password採用時: Sheetへ保存するのはalgorithm、salt、iterations、verifier、失敗数、lock、初回変更flagだけ。
- 実測: GASでPBKDF2時間、同時login、timeoutを測り、iteration値を再承認。
- stop: 平文または可逆password列を要求されたら実装を止め、riskを提示する。

### P3D-T02 credential provisioning

- AUTH_MANAGER用のGAS sidebarまたは管理画面で初期credentialを生成し、Sheetセルへ平文入力させない。
- 初期passwordの伝達経路、期限、初回変更、reset本人確認、退職者失効を定義。
- edge case: メール重複、変更、管理者自身lock、最後の管理者失効。
- test: browser/history/log/Sheetに平文なし、権限外拒否。

### P3D-T03 login/session/logout

- Pages Function→GASで認証し、opaque session IDだけをHttpOnly Secure SameSite=Strict Cookieに置く。
- sessionはhashだけSheetへ保存。短いidle/absolute expiry、rotation、logout/revokeを実装。
- CSRF: same-origin、content-type、Origin/Referer検証、必要ならtokenを併用。
- public error: 不存在、誤password、REVOKED、lockを区別しない。
- test: session fixation、cookie属性、複数tab、clock skew、logout、role変更直後、退職者。

### P3D-T04 endpoint authorization matrix

- INPUT: login/logout、schema status、registerだけ。
- ADMIN: INPUT権限に加えlist/detail/analytics/export/correction。
- AUTH_MANAGER: 採用決定に従いcredential管理だけ。成績閲覧はrole継承を明示しない限り許可しない。
- GASは毎APIでUsers Role/Statusを再読込し、clientのrole値を信用しない。
- test: 画面非表示だけでなく直接HTTP、改変body、失効sessionで全endpointを確認。

## 8. Phase 3E: Cloudflare Functions・GAS transport

### P3E-T01 API allowlistと共通envelope

- `/api/auth/*`、`/api/register`、`/api/analytics/*`、`/api/export/ml`等を明示allowlist化。
- method、content-type、body size、timeout、request ID、error codeを固定。
- error responseへstack、Sheet ID、email、payloadを出さない。
- test: 未知path/method、巨大body、壊れたJSON、slow GAS、abort。

### P3E-T02 HMAC relay

- Functionがmethod/path/timestamp/nonce/body hashを署名し、GASがconstant-time検証する。
- current/next key rotationを無停止で行えるようにする。
- nonceは個人情報と結び付けず、短期保存・期限切れ清掃。
- test: body/path改変、replay、期限前後、key rotation中、同時request。

### P3E-T03 log redaction・cache防止

- Functions/GASともrequest/response body、cookie、auth header、password、PDF textをlogしない。
- 全API responseへ`Cache-Control: no-store`等を付ける。
- test: Cloudflare runtime log、GAS execution log、browser cache、service worker不在を確認。

## 9. Phase 3F: browser PDF parser

### P3F-T01 pdf.js固定版self-host

- versionとhashを固定し、同一originから配信。workerも同様。
- license、脆弱性、更新手順、rollback versionを記録。
- 禁止: CDN実行、PDF upload、Web Storage、consoleへの抽出全文。
- test: Network panelでPDF送信なし、外部requestなし、CSP下で動作。

### P3F-T02 PDF bytes→layout adapter

- ArrayBufferからpage、text item、座標、font/transformを抽出し、既存parser inputへ決定的に変換。
- size/page/token上限、cancel、memory解放、password PDF、壊れたPDF、画像PDFを扱う。
- edge case: ligature、文字分割、縦書き、空白消失、ページ回転、異なる生成ソフト。
- test: browser別、同一PDF決定性、途中cancel、巨大PDF。

### P3F-T03 Schema registryとgolden test

- key: provider、exam type、year/round、schema version、parser version。
- 各新帳票受領時: 入手→個人情報を残さないfixture化→detect差分→parser追加→旧版回帰→業務確認→release。
- 未知Schemaは推測せず、利用者へ対応外理由と必要な連絡先を表示。
- golden: 会社が許可した匿名化/合成fixtureで項目別期待値を保持。実PDFをGitへ置かない。
- feedback: 新しい回次ごとに帳票担当が抽出previewを確認。

### P3F-T04 登録前確認

- 校舎はupload時に必須選択。導入校舎masterはGASから取得し、無効校舎を拒否。
- 画面に候補者、模試、回次、主要得点、欠損、警告、schema/parser versionを表示。
- 別帳票、別生徒混入、必須ページ不足、低confidenceは登録buttonを有効化しない。
- test: 二重click、tab閉鎖、file差替え、校舎変更、登録中cancel。

## 10. Phase 3G: 分析・個人画面・ML

### P3G-T01 analytics API

- GASがrole、filter allowlist、母数、欠損、version整合性を検証し、可能な限り集計値だけ返す。
- server最低抑制閾値はclientで下げられない。
- query budget、組合せ制限、roundingまたは追加抑制で差分攻撃を軽減。
- test: 小人数、連続filter差、混在metric、旧Schema、partial data、巨大期間。

### P3G-T02 分析UI本番接続

- 静的JSON adapterを認証済API adapterへ交換する。
- loading/empty/partial/suppressed/schema/permission/errorを実応答で表示。
- 指標ごとに定義、対象n、除外n、欠損理由、更新時刻、比較可能性を示す。
- feedback: P3A-T02と同じscenarioを再実施し、prototypeとの差を評価。
- accessibility: keyboard、focus、contrast、screen reader、zoom、responsive。

### P3G-T03 個人詳細

- ADMINだけ。氏名表示方針はG0決定に従う。
- 閲覧目的または少なくともactor/requestを監査し、一覧の過剰取得を避ける。
- Person identity未確定、訂正中、回次非比較を明示。
- test: direct URL、ID enumeration、他role、stale data、統合分離直後。

### P3G-T04 ML CSV本番実装

- ADMINの明示操作、用途、期間、項目、件数を検証。
- 監査記録を確定できなければCSVを返さない。
- CSV本文をserver保存・logしない。browser Blob URLはdownload後revoke。
- row/size上限、streaming可否、timeout、再実行識別、formula injectionを検証。
- feedback: データ利用責任者が列定義、保存期間、削除手順を承認。

## 11. Phase 3H: backup・監視・運用

### P3H-T01 backup/restore

- Drive内で世代backupを作成し、BackupLogへ対象、件数、hash、日時、結果を記録。
- retentionはG0決定に従う。実データを外部へcopyしない。
- restoreは別sandboxへ復元し、件数/hash/参照整合性/監査chainを検証。
- test: backup中のwrite、部分失敗、容量不足、旧Schema restore。
- gate: restore訓練未成功なら本番不可。

### P3H-T02 monitoring・incident response

- 個人情報を含まないhealth、error code、latency、quota残量、PENDING滞留、backup失敗を監視。
- alert owner、一次切分け、機能停止、secret rotation、利用者連絡、事後レビューをrunbook化。
- test: synthetic failure drill、連絡網、閲覧権限、log redaction。

### P3H-T03 release・rollback・引継ぎ

- releaseはcommit SHA、GAS version、Sheet SchemaVersion、parser version、rollback先を対応付ける。
- one-version-back互換を維持し、列削除をrollback手段にしない。
- 副ownerがdeploy、secret rotation、user revoke、restoreを手順だけで実行できるか訓練。

## 12. Phase 3I: UAT・pilot・本番判定

### P3I-T01 role別E2E

- INPUT: login、校舎選択、PDF解析、確認、登録、重複/未知/失敗。閲覧APIは拒否。
- ADMIN: 全校舎閲覧、分析、個人、訂正、ML export。
- AUTH_MANAGER: 採用した範囲だけ。成績権限を暗黙付与しない。
- 全role: logout、session timeout、role/status変更、複数tab。

### P3I-T02 負荷・quota・障害試験

- 同時登録、同時login、複数分析、最大payload、年度分割、巨大exportを実測。
- GAS実行時間、Sheet read/write、Cloudflare CPU/timeout、browser memoryを記録。
- quota値は試験日時と公式sourceを記録し、仕様書の古い数値を転記しない。

### P3I-T03 段階pilot

- 合成データ→許可済み匿名化帳票→限定校舎・限定担当者の順。
- check point: 10件、50件、100件または業務量に合わせた節目。
- 各節目でparser error、重複、訂正、本人照合、分析誤解、操作時間、問い合わせをreview。
- stop condition: 個人情報境界違反、誤登録、権限逸脱、復元不能、未知Schema誤受理。

### P3I-T04 最終feedbackと承認

- 参加: 業務責任者、INPUT代表、ADMIN代表、帳票担当、情報管理、system owner。
- 確認: 要求別証跡、既知制約、残余risk、運用負荷、教育上の有用性、rollback。
- 出力: 採用/条件付き採用/延期、条件、責任者、期限。
- 本番化後も最初の模試返却ごとにretrospectiveを行い、Schema対応時間と誤りを記録する。

## 13. 利用者にお願いする操作・判断

これらは技術担当だけで代行しない。

1. 会社としてCloudflare、GitHub、Google Drive/Sheets、ML CSV例外を承認する。
2. 認証方式とAUTH_MANAGERの扱いを決める。
3. 本番owner、副owner、INPUT/ADMIN候補を決める。
4. GitHub Appを対象repoだけに許可する。
5. 職場Google accountでDrive/GAS/Sheets資源を作る、または共同作成を承認する。
6. 許可済みの多様な帳票fixtureと、期待値確認担当者を用意する。
7. PersonIDの統合・分離ルールを業務として承認する。
8. 講師・社員feedback会とUATへ参加者を割り当てる。
9. 最終的な残余riskと本番開始を承認する。

## 14. 直近の進め方

1. 本監査書と本計画は2026-09-29に利用者承認済み。
2. P3A-T01の未決事項を`phase-3-v1.1-decision-register.md`で管理する。
3. 会社説明は現行の合成デモで行い、未接続であることを明示する。
4. 会社承認までは外部資源を増やさず、P3Aの文書・test設計を詰める。
5. 承認後、G1から順に一taskずつ実装・検証・feedbackする。

## 15. 完了定義

「コードがある」だけでは完了ではない。全要件が実装、実環境試験、security review、業務feedback、復元訓練、所有権引継ぎ、責任者承認まで追跡され、未解決P0/P1がないことをPhase 3完了条件とする。
