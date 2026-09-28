# 仕様v1.1 決定台帳

- 作成日: 2026-09-29
- 対応task: P3A-T01
- 状態: IN_PROGRESS
- 基準計画: `phase-3-production-implementation-plan-v2.md`

## 1. 承認の境界

2026-09-29に利用者から、客観監査結果とPhase 3詳細実装計画を今後の基準として採用する承認を得た。

この承認は、次を意味しない。

- 会社としてCloudflare Freeまたは外部委託を承認したこと
- 実際の個人成績を処理すること
- Cloudflare/GitHub/Googleの権限変更・公開・Secret投入を許可したこと
- OTPからpassword認証へ仕様変更すること
- 未決の保持期間、削除、RPO/RTO、role設計を確定したこと

個別項目は本台帳で決定者と承認日を記録してから実装へ進む。

## 2. 確定済み要求

| ID | 決定 | 根拠 | 実装への拘束 |
|---|---|---|---|
| D-001 | 1データごとに校舎情報を保持し、upload時に選択する | 利用者要望 | 校舎masterと必須LocationIDを持つ |
| D-002 | 導入校舎は将来増える | 利用者要望 | code埋込みではなくmaster管理 |
| D-003 | INPUTは登録のみ、ADMINは全データ閲覧 | 利用者要望 | UIとAPIの両方で強制 |
| D-004 | INPUTを自校舎だけに限定しない | 利用者要望 | account権限でroleを管理し、校舎scopeを追加しない |
| D-005 | 社内生徒IDは存在しない | 利用者要望 | system生成PersonIDと本人照合を用いる |
| D-006 | 初期対象は河合塾・全統共通テスト模試 | 利用者要望 | 他模試を拒否し、Parser追加可能な構造にする |
| D-007 | 回次を識別し、同一人の推移を扱う | 利用者要望 | ExamEvent/Year/Roundを独立管理 |
| D-008 | 指導内容は人が決め、systemは判断材料を揃える | 利用者要望 | 自動指導・断定的推奨を実装しない |
| D-009 | 個人情報の永続保存先は原則、職場Google Drive上の非共有Sheetsだけ | 利用者承認 | Cloudflare/GitHub/browser storageへ保存しない |
| D-010 | ML用CSVだけはADMINが端末download可能 | 利用者承認 | 直接識別子除外、監査、警告、用途制限 |
| D-011 | 情報損失なく軽量ならSheetセル内JSONを正本にできる | 利用者承認 | version、chunk、hash、完全復元を必須にする |
| D-012 | 監査結果とPhase 3詳細計画を基準として採用する | 2026-09-29利用者承認 | task/gate/feedback/rollbackを省略しない |
| D-013 | 初期認証はメールアドレス＋password、忘れた場合はAUTH_MANAGERがresetする | 2026-09-29利用者承認 | OTP回復は将来追加可能にし、初期版では必須にしない |
| D-014 | password本文は保存せず、salt付きverifierだけをUsers Sheetへ保存する | 2026-09-29利用者承認 | 平文・可逆暗号・hint列を禁止する |
| D-015 | password導出はCloudflare Functionの処理中memoryで行い、永続保存・log出力しない | 2026-09-29利用者承認 | 実装前にWeb Crypto性能と通信手順をsecurity testする |
| D-016 | GAS URLの秘密性へ依存せず、全GAS requestにHMAC、timestamp、nonce、body hashを必須とする | 2026-09-29利用者承認 | 署名不正時はSheetへ触れる前に拒否する |
| D-017 | session CookieはCloudflareが発行し、session hash・Role・StatusはGAS/Sheetsで管理する | 2026-09-29利用者承認 | GASは毎APIでRole/Statusを再確認する |

## 3. 推奨案付き未決事項

| ID | 論点 | 推奨案 | 理由 | 必要な承認 |
|---|---|---|---|---|
| U-001 | 認証方式の会社承認 | PASSWORD_WITH_ADMIN_RESET。OTP回復は将来追加 | 利用者承認済み。会社の認証規程との整合だけを残す | 会社情報管理・業務責任者 |
| U-002 | password処理方式の会社承認 | Cloudflare Web CryptoでPBKDF2等を実測し、salt付きverifierのみ保存 | GASにはpassword KDF向け標準APIがなく、平文保存を避ける | 会社情報管理 |
| U-003 | AUTH_MANAGER | 独立role。credential管理のみで成績閲覧権限を暗黙付与しない | 職務分離と最小権限 | 業務責任者 |
| U-004 | ADMINの氏名表示 | 個人詳細と必要な一覧だけ。集計画面は原則識別子なし | 過剰表示を避けつつ指導業務を維持 | 講師・業務責任者 |
| U-005 | Person照合 | 自動候補＋人によるCONFIRMED。氏名単独で確定しない | 同姓同名・改姓・転校への耐性 | 業務責任者 |
| U-006 | Cloudflare利用 | 合成demo後、会社承認を得てPages/Functionsだけ使用。KV/D1/R2に個人情報なし | 仕様の責任分離を保つ | 会社情報管理 |
| U-007 | account所有 | 本番ownerと副ownerを会社が指定し、個人1名依存を禁止 | 退職・事故時の継続性 | 会社責任者 |
| U-008 | preview | 無効化またはCloudflare Accessで保護。本番Secretをpreviewへ置かない | preview URL漏洩を防ぐ | system owner |
| U-009 | 保持期間 | 成績、audit、session、backup、ML CSVで別々に期間を定める | 一律期間では業務・security要件が衝突 | 会社情報管理・業務責任者 |
| U-010 | RPO/RTO | pilot前に業務許容値を決め、restore訓練で検証 | backupの存在だけでは復旧性を証明できない | 業務責任者 |
| U-011 | 小人数抑制 | server最低値を固定し、連続query差分も制限 | client変更可能な閾値では再識別を防げない | 情報管理・講師代表 |
| U-012 | 実帳票fixture | 会社許可済み匿名化fixtureをGit外で管理し、期待値だけを版管理 | parser精度と個人情報境界を両立 | 情報管理・帳票担当 |
| U-013 | 空のCloudflare demo project | Git連携方式決定まで残置し、不要なら利用者確認後に削除 | 外部状態を無断変更しない | 利用者 |

## 4. feedback対象と確認質問

### 講師・社員

- 集計だけでなく、次の指導を考える材料として何が不足するか。
- 氏名が必要な画面と不要な画面はどれか。
- 校舎、学校、志望校、科目、分野、設問、回次をどの順に見るか。
- 欠損、未受験、小人数抑制を誤解しない表示になっているか。

### 情報管理担当

- Cloudflareによる一時処理とruntime logを許容できるか。
- password verifier方式、reset、初期password伝達を承認できるか。
- retention、削除、backup、ML CSV端末保存の規程は何か。
- owner退職、secret漏洩、誤共有時の連絡・停止責任者は誰か。

### 帳票対応担当

- 新しい模試返却後、誰が帳票入手・差分確認・期待値確認をするか。
- 未知Schemaを止めた際の目標対応時間は何営業日か。
- 正答、部分点、無回答、余分マーク、非掲載の意味を誰が承認するか。

## 5. Gate G0完了条件

- U-001〜U-013に、決定、決定者、日付、条件が記録されている。
- 仕様書v1.1または承認済み仕様変更に反映されている。
- role matrix、data lifecycle、account ownership、incident責任表が揃っている。
- 未受容のP0 riskがない。
- G1開始を会社責任者が明示承認している。

## 6. 2026-09-29認証方針承認記録

- 利用者承認: D-013〜D-017
- 技術判断記録: `ADR-0001-password-auth-and-gas-boundary.md`
- 残存gate: Cloudflareで資格情報を一時処理すること、外部service利用、運用責任者について会社承認を得る
- 未承認扱い: 実data接続、Secret投入、GAS/Cloudflare本番deploy
