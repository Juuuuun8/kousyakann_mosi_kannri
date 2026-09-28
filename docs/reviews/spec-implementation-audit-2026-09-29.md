# 仕様・実装 客観監査報告書

- 監査日: 2026-09-29
- 対象仕様: `seiseki_system_spec_v1.docx` v1.0（2026-09-26、リポジトリ外原本）
- 対象実装: `main` の `9c7665c` と、未コミットの `wrangler.toml` 日付修正
- 目的: 実装済み範囲を過大評価せず、本番との差、仕様自体の不足、承認事項を分離する

## 1. 結論

現状は、**本番システムではなく、契約・純粋ロジック・合成データUIを中心とする実装可能性検証**である。

- 会社説明用の架空データデモ: 条件付きで利用可能
- 本物のPDFを使う登録: 利用不可
- Google Sheetsを正本とする保存: 未接続
- 実ログインと権限制御: 未接続
- Cloudflare Pages FunctionsとGASの中継: 未実装
- 本番データを使う分析・ML CSV: 利用不可
- 本番稼働判定: **NO-GO**

2026-09-29の再実行では13 package suite、94テストが成功した。ただし、これは主に純粋関数と静的デモのテストであり、GAS、Google Sheets、Cloudflare、実PDF、実ブラウザ通信を検証したものではない。

## 2. 監査方法と判定語

次の情報を混同しない。

1. 原本仕様書の要求
2. 仕様書作成後に利用者が承認・追加した要求
3. 現在のコードが実際に行うこと
4. Cloudflare、Google、GitHubで実際に設定された外部状態

| 判定 | 意味 |
|---|---|
| LOCAL_VERIFIED | ローカルコードと自動テストで動作確認済み |
| CONTRACT_ONLY | 型、検証、純粋ロジックだけ。外部サービスへの実処理なし |
| PROTOTYPE_ONLY | 架空データまたは無通信UIだけ |
| NOT_IMPLEMENTED | 実行コードがない |
| EXTERNAL_TEST_REQUIRED | 実環境でのみ確認可能 |
| DECISION_REQUIRED | 会社・運用・仕様上の決定が先に必要 |

## 3. 実装済み範囲

| 領域 | 判定 | 客観的な実装内容 | 本番との差 |
|---|---|---|---|
| データ契約 | LOCAL_VERIFIED | Report、SubjectScore、Payload、欠損理由、版情報等の閉じた型とJSON Schema | Sheet列・移行・実保存未検証 |
| 高密度payload | LOCAL_VERIFIED | 決定的JSON、チャンク、hash、欠落・改ざん拒否 | Sheetセル上限、実API時間、同時書込未検証 |
| Parser core | LOCAL_VERIFIED | detect/extract/validate/normalize、fail-closed | 入力は抽出済みlayout token。PDF読込みではない |
| 河合塾Parser | CONTRACT_ONLY | 4論理ページ、科目、分野、志望校、解答明細の抽出規則 | pdf.js未接続。実帳票の座標・文字順回帰が不足 |
| 分析 | LOCAL_VERIFIED | 分布、母数、欠損、校舎・学校・科目・分野・志望校・回次比較、小人数抑制 | GAS集計ではない。反復照会による再識別対策なし |
| ML CSV | CONTRACT_ONLY | 固定列、直接識別子除外、仮名ID、式注入対策 | 実認可・監査・実データ取得と不可分な処理は未実装 |
| 認証 | CONTRACT_ONLY | password verifier、失敗回数、lock判定、session hash、Cookie属性 | GAS処理時間、Sheet競合、実Cookie、再設定経路なし |
| 通信 | CONTRACT_ONLY | HMAC canonical request、timestamp、nonce、body hash | Pages Function、GAS endpoint、nonce storeなし |
| 監査 | CONTRACT_ONLY | 閉じた監査列、hash chain | Sheet追記、失敗時記録、検証ジョブなし |
| 保存 | CONTRACT_ONLY | PENDING→ACTIVE計画、重複、訂正、年度・part routing | SpreadsheetApp/LockServiceコードなし |
| 分析UI | PROTOTYPE_ONLY | 24名・3校舎・2回次・7科目の合成デモ | 静的JSONを読み、認証もGASも使わない |
| ログインUI | PROTOTYPE_ONLY | 資格情報を保存・送信しない安全な外形 | 常に失敗し、ログイン機能はない |
| アップロードUI | PROTOTYPE_ONLY | MIME/拡張子/サイズ、browser SHA-256、送信なし | PDF解析・確認・登録は無効 |
| CI | LOCAL_VERIFIED | Node固定、npm ci、型、テスト、PII scan、履歴scan | 外部結合、E2E、依存脆弱性、ブラウザ試験なし |
| 静的配信 | PARTIAL | `dist` buildと`_headers`あり | Git連携未完、配備未成功、アクセス制御なし |

## 4. 仕様要求別の主要差分

### 4.1 アーキテクチャと個人情報境界

- PDFをブラウザだけで処理する方針は、無送信のアップロード試作と禁止検査に反映されている。
- 実際のpdf.js、Web Worker、メモリ破棄、Network panel試験はない。
- 静的デモの`data/demo-dataset.json`は合成データなので許容できる。本番データを同じ経路に置くことは禁止する。
- `_headers`の`no-store`は`/api/*`だけであり、静的JSONは配信キャッシュ対象になり得る。合成デモ限定と明示し、本番データAPIへ流用しない。
- Cloudflareの「保存しない」は「処理もログも一切発生しない」と同義ではない。ログ本文、例外、Analytics、第三者委託条件を別途確認する。

### 4.2 認証・認可

- 原仕様はメールOTP方式で、独自パスワードを保管しない。
- 後発要望は、Usersシートでメールアドレスと管理者設定パスワードを管理する方式である。
- `SPEC-CHANGE-005`は安全なverifier方式として提案済みだが、会社承認待ち。平文パスワード列を作る案は採用してはならない。
- INPUT登録のみ、ADMIN全データ閲覧という権限契約はあるが、APIで強制する実装はない。
- 原仕様のAUTH_MANAGERと、利用者が明示したINPUT/ADMIN運用の関係が未確定である。認証情報を誰が発行・失効できるかを確定する必要がある。
- CSRF、セッション固定、Cookie削除、秘密情報rotation、管理者再認証、初期パスワード伝達、退職者失効の実装がない。

### 4.3 PDF・帳票Schema

- 対象は河合塾・全統共通テスト模試の初期Schemaだけでよいという範囲は守られている。
- ただし実PDF bytes→pdf.js text item→layout tokenの接続がなく、「実帳票を読める」とはまだ言えない。
- テストfixtureは合成layoutであり、匿名化した実PDF由来のgolden fixtureではない。
- 回次、年度、レイアウト改訂、フォント差、文字分割、縦横順、画像PDF、欠落ページ、別生徒ページ混入を実物で検証していない。
- 新模試追加のplugin境界は概ねあるが、Schema registry、対応状況表示、旧Schema保守期間、緊急停止手順がない。

### 4.4 Google Sheets正本

- JSONセル正本の情報損失防止ロジックはある。
- SpreadsheetApp、LockService、台帳、年度別file自動作成、容量分割、書込後再読込hash照合はない。
- 訂正履歴、SUPERSEDED、重複排除はwrite planまでで、実トランザクションではない。
- Google Sheetsには一般的DBトランザクションがないため、PENDING行、冪等key、補償処理、再実行手順を実アダプタで証明する必要がある。
- バックアップ生成、世代管理、復元訓練、RPO/RTOは未実装・未決定である。

### 4.5 生徒同一性

- 原仕様のStudentKeyは、社内生徒IDが存在しないという利用者条件と両立しない。
- システム生成PersonIDへ修正した点は妥当だが、氏名だけの自動照合は危険である。
- 改姓、同姓同名、学校転校、表記揺れ、学年更新、受験番号変更を含む確認待ちqueueと手動統合・分離履歴が必要である。
- 本人対応が確定していないデータを個人推移やMLへ混ぜてはならない。

### 4.6 分析

- 教育現場に必要な母数、中央値、四分位、欠損、全国差、同学力帯差、設問状態、志望校、回次比較を提示する方向は妥当である。
- 「次に誰へ何を指導するか」を自動決定しない方針も守られている。
- 本番では、指標定義、対象母集団、除外理由、比較可能性、更新時刻、SchemaVersionを画面ごとに表示する必要がある。
- 小人数閾値を利用者が変更できるデモ仕様は本番に不適切。最小閾値はサーバーで強制する。
- 複数filterの差を取る再識別、個人詳細閲覧、志望校別小集団には、クエリ制限・監査・必要に応じた追加抑制が要る。
- 分析の有用性はコードだけで決められない。講師・社員による課題別レビューを正式な受入条件にする。

### 4.7 ML出力

- 端末ダウンロード例外、直接識別子除外、仮名化、式注入対策の契約はある。
- 本番では、監査記録が成功した後だけCSVを返す順序、巨大出力制限、途中失敗、用途・保存期限、削除確認を実装する必要がある。
- ML_IDは匿名化ではない。鍵管理者が元PersonIDと対応できる仮名化データとして扱う。

### 4.8 運用・所有・可用性

- 個人のCloudflare/GitHub/Googleアカウントだけに依存する本番運用は、退職・異動・事故時の継続性が不足する。
- 本番所有者、副所有者、請求、Secret引継ぎ、緊急停止、インシデント連絡、保守時間を会社として決める必要がある。
- 無料枠の可否やquota値は変更され得る。仕様書記載値を固定事実とせず、導入時に公式情報と実負荷で再判定する。

## 5. 仕様書自体への客観的指摘

| 優先 | 指摘 | 必要な対応 |
|---|---|---|
| P0 | StudentKeyの安定ID前提が事実と違う | PersonIDと本人照合業務を正式仕様化 |
| P0 | OTP原仕様とpassword要望が衝突 | 認証方式を会社承認しv1.1へ統合 |
| P0 | 本番所有者・副所有者・退職時移管が弱い | 個人依存を避ける運用責任表を承認 |
| P0 | 保存先制約はあるが、保持期間・削除・法的根拠がない | データライフサイクル規程を追加 |
| P1 | 小人数抑制だけで差分攻撃を扱っていない | server-side query policyを追加 |
| P1 | Sheet障害時の整合性回復が概念的 | 冪等性、補償、隔離、復旧runbookを追加 |
| P1 | RPO/RTO、SLO、障害連絡がない | 運用非機能要件を数値化 |
| P1 | AUTH_MANAGERとINPUT/ADMINの関係が未確定 | 役割と職務分離を決定 |
| P1 | Cloudflareでの処理・ログ・委託条件の評価が薄い | 情報セキュリティ・法務レビュー |
| P2 | アクセシビリティ、対応browser、端末条件が弱い | 非機能受入基準を追加 |

## 6. リスク順位

### P0: 本番開始を止めるもの

1. 認証方式が未承認で、実認証・実認可が存在しない。
2. GAS/Sheet保存が存在せず、正本性・競合・復旧を証明できない。
3. Cloudflare Functions/GAS HMAC中継が存在しない。
4. 実PDFを読むpdf.js adapterと実帳票golden testがない。
5. PersonIDの本人照合運用が確定していない。
6. Cloudflare利用、所有者、秘密情報、保持期間の会社承認がない。

### P1: pilot前に解消するもの

1. サーバー強制の小人数抑制と差分攻撃対策。
2. バックアップ・復元訓練、RPO/RTO。
3. 訂正、再実行、二重送信、部分失敗の実アダプタ試験。
4. ログredaction、監査hash検証、incident runbook。
5. ML出力の認可・監査・失敗時原子性。
6. 実端末・実browser・実quotaでの負荷試験。

### P2: 本番品質を高めるもの

1. 教員レビューに基づく分析画面改善。
2. accessibility、keyboard、印刷、responsive確認。
3. 新Schema追加手順、support期限、release note。
4. 依存関係更新、SBOM、供給網レビュー。

## 7. 外部状態

| 対象 | 現在の状態 | 判断 |
|---|---|---|
| GitHub | private repo、`main`は`9c7665c` | 正しい。仕様書原本・実データはpushしない |
| Google Sheetsデモ | 非公開の架空データSheet | 説明用。frontendとは直接接続していない |
| Cloudflare | `kousyakann-mosi-kannri-demo`という空のDirect Upload projectだけ存在。deploymentなし | 勝手に削除しない。残置/削除を利用者が判断 |
| Cloudflare Git連携 | GitHub App内部エラーで未接続 | 利用者によるrepo限定承認が必要 |
| Vercel | 設定をrepoから除去済み | 仕様外ホスティングとして使わない |

## 8. Cloudflare GitHub Appとは何か

`Cloudflare Workers and Pages` GitHub Appは、Cloudflareが指定repoのソースを読み、push通知を受け、build/deployするためのGitHub側の許可である。秘密のコードを別途repoへ入れるものではない。

利用者が後で行う操作は次のとおり。

1. GitHubのSettings > Applications > Installed GitHub Appsを開く。
2. `Cloudflare Workers and Pages`をInstall/Configureする。
3. `Only select repositories`を選び、`Juuuuun8/kousyakann_mosi_kannri`だけを許可する。
4. CloudflareでConnect to Gitをやり直す。
5. production branch、build command、output directory、preview方針を双方で確認する。

組織repoの場合はGitHub Organization ownerまたはGitHub Apps Managerの承認が必要になる。現時点で急いで実行する必要はなく、会社承認と計画レビュー後に共同で行う。

公式資料:

- https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/
- https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/

## 9. Go/No-Go

| 用途 | 判定 | 条件 |
|---|---|---|
| 社内説明、架空データだけの画面共有 | GO | 架空・未接続・未承認を明示 |
| 公開URLへ架空デモを配置 | CONDITIONAL | 公開範囲、期限、不要後削除、preview設定を利用者が承認 |
| 本物PDFで試す | NO-GO | 実pdf.jsと会社承認が先 |
| 本物の個人成績を登録・表示 | NO-GO | P0完了と受入承認が先 |
| ML用CSVを実データで出力 | NO-GO | 認可・監査・取扱規程・pilotが先 |

## 10. 次の基準文書

以後の作業は、`docs/plans/phase-3-production-implementation-plan-v2.md`を実行順序の基準とする。各taskは、仕様参照、前提、実装、例外、テスト、証跡、rollback、feedback、承認gateを満たすまで完了扱いにしない。
