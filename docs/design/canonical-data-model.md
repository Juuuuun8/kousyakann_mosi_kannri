# Google Sheets正本データモデル案

## 1 結論

正本は、検索・集計に使う通常列と、可変・高密度情報を持つ版管理JSONを組み合わせる。すべてをJSONへ詰めず、すべてを設問1行へ展開もしない。

- 通常列: 校舎、模試、回次、学校、PersonID、科目成績、状態、版、監査キー
- JSON正本: 解答明細、帳票印字の成績推移、分野別詳細、志望校詳細、講評等
- 派生データ: ダッシュボード集計、推定正解、ML特徴量。正本と分離し再生成可能にする

この案はPhase 1の比較試験で、完全復元、セル数、文字数、読書き時間、同時更新、分析時間を満たした場合に確定する。

## 2 識別子

| 識別子 | 範囲 | 生成 | 用途 |
|---|---|---|---|
| LocationID | 校舎 | 校舎マスタ | アップロード時選択、校舎比較 |
| ExamDefinitionID | 模試定義 | システム | 提供元・模試種別を識別 |
| ExamEventID | 年度・回次 | システム | 例: 年度、第2回、実施日を識別 |
| SchemaVersionID | 帳票レイアウト | 開発時登録 | detect対象の帳票版 |
| PersonID | 生徒 | 初回確定時にUUID生成 | システム内部の安定ID |
| ExamCandidateID | 受験 | 帳票受験番号等 | ExamEvent内だけで使用 |
| ReportID | 1人1帳票 | 登録時UUID | 成績正本の親ID |
| RecordID | 正本レコード | 登録時UUID | 訂正・監査単位 |
| PayloadID | JSON payload | 登録時UUID | チャンクとハッシュ検証 |
| ML_ID | ML出力 | HMAC(PersonID) | 仮名化ID。原則ローテーション方針を別途定義 |

社内に既存の生徒IDはないため、PersonIDは本システムが生成する。受験番号をPersonIDとして使わない。

### 2.1 本人照合

自動照合に十分な一意項目が帳票にない可能性がある。そこで、学校コード、氏名カナ、卒業見込年度等から候補を提示するが、複数候補、氏名変更、転校、表記差がある場合はADMINが結合・新規・保留を選ぶ。曖昧な状態で自動結合しない。

| 状態 | 意味 | 分析への扱い |
|---|---|---|
| RESOLVED | PersonIDが確定 | 時系列分析可 |
| NEW_CONFIRMED | 新規PersonIDとして確定 | 時系列分析可 |
| AMBIGUOUS | 複数候補 | 当該回の単発集計のみ。個人推移から除外 |
| UNRESOLVED | 候補なし・未確認 | 当該回の単発集計のみ |
| MERGED | 後からPersonIDを統合 | 監査履歴を残し再集計 |
| SPLIT | 誤結合を分離 | 監査履歴を残し再集計 |

氏名等を連結した無塩SHA-256を安定IDにしない。候補検索用の正規化値やHMACを使う場合も、本人確認の代替にはしない。

## 3 システム台帳ブック

| シート | 主な列 | 目的 |
|---|---|---|
| Settings | Key, Value, ValueType, UpdatedAt | 閾値、現行版、運用設定 |
| Locations | LocationID, Name, Status, ValidFrom, ValidTo | 校舎追加・改名・廃止 |
| ExamDefinitions | ExamDefinitionID, Provider, Family, Name, Status | 模試種類マスタ |
| ExamEvents | ExamEventID, ExamDefinitionID, AcademicYear, Round, ExamDate | 年度・第何回を表現 |
| SchemaVersions | SchemaVersionID, DetectVersion, EffectiveFrom, Status | 帳票版 |
| PayloadFormats | PayloadFormatVersion, PayloadType, FieldOrder, Status | JSON tuple定義 |
| DataFiles | AcademicYear, Part, SpreadsheetID, Status, CellCountEstimate | 保存先索引 |
| AuditIndex | Period, SpreadsheetID, Status | 監査ログ索引 |

Locationsの名称は履歴管理し、過去ReportのLocationIDを書き換えない。画面では指定日時に有効な表示名を使う。

## 4 成績データブック

### 4.1 Reports

1行を1帳票とする。通常の検索と登録状態の正本である。

| 列 | 型 | 必須 | 内容 |
|---|---|---:|---|
| ReportID | UUID | 必須 | 帳票ID |
| Status | enum | 必須 | PENDING / ACTIVE / SUPERSEDED / REJECTED |
| LocationID | string | 必須 | アップロード時の校舎 |
| ExamEventID | string | 必須 | 年度・回次を含む模試 |
| PersonID | UUID/null | 条件付 | 本人照合未確定時はnull |
| IdentityStatus | enum | 必須 | 本人照合状態 |
| ExamCandidateID | string | 条件付 | 帳票受験番号。ExamEvent内だけで解釈 |
| SchoolCodeRaw | string/null | 任意 | 帳票原表記 |
| SchoolNameRaw | string/null | 任意 | 帳票原表記 |
| GradeRaw | string/null | 任意 | 帳票原表記 |
| ClassRaw | string/null | 任意 | 帳票原表記 |
| LocalNumberRaw | string/null | 任意 | 帳票原表記 |
| StudentNameKanaRaw | string/null | 任意 | 直接識別子 |
| SchemaVersionID | string | 必須 | detectした帳票版 |
| ParserVersion | string | 必須 | 抽出ロジック版 |
| NormalizationVersion | string | 必須 | 正規化規則版 |
| PdfHash | hex | 必須 | PDFバイト列のSHA-256 |
| SemanticFingerprint | hex | 必須 | 主要正規化値から作る重複候補キー |
| PageCount | integer | 必須 | 検証用 |
| SubjectCount | integer | 必須 | 保存後検証用 |
| PayloadCount | integer | 必須 | 保存後検証用 |
| ImportedAt | datetime | 必須 | 登録日時 |
| ImportedBy | email | 必須 | 登録者。分析レスポンスへ通常返さない |
| SupersedesReportID | UUID/null | 任意 | 訂正元 |

### 4.2 Persons

| 列 | 型 | 内容 |
|---|---|---|
| PersonID | UUID | システム生成ID |
| Status | enum | ACTIVE / MERGED / SPLIT_REVIEW |
| CanonicalNameKana | string/null | 照合用。直接識別子 |
| ExpectedGraduationYear | integer/null | 時系列照合補助 |
| CurrentSchoolCode | string/null | 照合補助。変更履歴は別シート |
| CreatedAt, CreatedBy | 監査 | 作成情報 |
| MergedIntoPersonID | UUID/null | 統合先 |

Personの属性履歴と照合根拠は `PersonIdentityHistory` に追記し、過去値を上書きしない。

### 4.3 SubjectScores

頻繁に検索・集計するため通常行形式とし、1行をReport×MetricDefinition×Subjectとする。

| 列群 | 主な列 |
|---|---|
| キー | RecordID, ReportID, SubjectDefinitionID, MetricDefinitionID |
| 本人値 | Score, MaxScore, ScoreRate, Deviation, AbilityLevel |
| 全国 | NationalAverage, NationalRank, NationalPopulation |
| 現役・高卒 | CurrentStudentAverage, GraduateAverage, CurrentRank, CurrentPopulation |
| 校内 | SchoolDeviation, SchoolAverage, SchoolRank, SchoolPopulation |
| 品質 | MissingReason, SourceLabelRaw, ValueHash |
| 版 | SchemaVersionID, ParserVersion, NormalizationVersion |

総合指標、換算得点、私大評価用偏差値も、MetricDefinitionIDを分けて同じ形式へ格納する。異なる定義の偏差値を同一列名だけで混ぜない。

### 4.4 ReportPayloads

| 列 | 型 | 内容 |
|---|---|---|
| PayloadID | UUID | payload全体ID |
| ReportID | UUID | 親帳票 |
| PayloadType | enum | TREND / DOMAIN / ANSWER_MARKS / TARGETS / NARRATIVE / RAW_LABELS |
| SubjectDefinitionID | string/null | 科目単位の場合 |
| PayloadFormatVersion | string | tupleと意味の版 |
| ChunkIndex | integer | 0始まり |
| ChunkCount | integer | 総チャンク数 |
| ItemCount | integer | payload全体の論理件数 |
| PayloadHash | hex | チャンク結合後のSHA-256 |
| ChunkHash | hex | 当該チャンクのSHA-256 |
| JsonText | string | minifyした決定的JSON |
| CreatedAt | datetime | 保存日時 |

保存直後に全チャンクを再読込し、ChunkCount、重複・欠番、ChunkHash、PayloadHash、ItemCount、スキーマ検証、元オブジェクトとの完全一致を確認する。1つでも失敗したReportはACTIVEにしない。

## 5 JSON形式

### 5.1 共通原則

1. UTF-8相当の文字列として扱い、Unicode正規化規則を版管理する。
2. オブジェクトキー順、配列順、数値表現、null表現を固定し、決定的にシリアライズする。
3. tupleの位置と型はPayloadFormatsで定義する。
4. 生値と正規化値を必要に応じて併記し、原表現を捨てない。
5. `null` は値不明だけに使い、理由はMissingReasonで表す。
6. 圧縮やBase64化は初期案で行わない。可読性と障害解析を優先し、必要なら別ADRで検討する。
7. 1セルの実用上限を40,000文字とする暫定ガードを置き、実環境検証後に確定する。超過時は論理項目境界でチャンク化する。

### 5.2 ANSWER_MARKS例

```json
{"v":1,"type":"answer_marks","subject":"ENG_R","items":[[1,"1","○","CORRECT","1",null],[1,"2","×","WRONG","3",null]]}
```

tupleは `[大問, 解答番号原表記, 正誤原表記, 正誤正規化, マーク原表記, MissingReason]` とする。実装時はこの例を直接固定せず、PayloadFormatsの契約テストから生成する。

### 5.3 DOMAIN例

科目単位の講評原文をpayload直下に1回だけ保持し、設問行には設問番号原表記、分野名、本人得点・配点、全国・校内・同学力帯平均、同学力帯平均との差、得点率差、帳票評価、一段階上判定者平均・差を保持する。別帳票で設問固有講評が存在する場合に備え、行単位の講評欄もnull許容で残す。指標が帳票に存在しない場合は項目省略ではなく、形式で定めた位置にnullとMissingReasonを置く。

### 5.4 TARGETS例

志望順位ごとに、日程、大学・学部・学科方式の原表記、正規化ID、募集人員、判定、本人指標種別・値、満点、ボーダー、第1志望者・総志望者の順位・人数・平均をまとめる。評価人数分布は判定帯の下限原表記・判定記号・人数、教科別詳細は平均偏差値・本人得点・大学配点を保持する。最大9件という現行帳票上の観測値をDB上限にしない。

## 6 欠損と品質

| MissingReason | 意味 | 集計 |
|---|---|---|
| NOT_APPLICABLE | 科目・指標が対象外 | 母数外 |
| NOT_TAKEN | 生徒が未受験 | 0点にせず母数外、未受験率には含める |
| NOT_PRINTED | 帳票に掲載なし | 母数外 |
| BLANK_ON_REPORT | 帳票上の空欄 | 別件数で表示 |
| UNREADABLE | 文字層から確定不能 | 登録ゲートまたは要確認 |
| PARSER_ERROR | 抽出処理失敗 | ACTIVE不可 |
| UNKNOWN_CODE | 未知記号・未知科目 | ACTIVE不可または要確認 |
| REDACTED | 権限上非表示 | 集計値自体とは分離 |

Parserは値を0、空文字、`/`へ潰さない。原表記、正規化値、MissingReasonを区別する。

## 7 登録トランザクション

| 状態 | 条件 | 次の動作 |
|---|---|---|
| PARSED | ブラウザ解析完了 | 利用者確認へ |
| VALIDATED | 必須検証成功 | GASへ必要データ送信 |
| WRITING | GASがLock取得 | ReportsをPENDINGで作成し子レコード保存 |
| VERIFYING | 全行保存済み | Sheets再読込・件数・ハッシュ・完全復元検証 |
| ACTIVE | 全検証成功 | 分析対象へ公開 |
| FAILED | 任意の検証失敗 | ACTIVEにせず失敗記録。部分データは回収対象 |
| SUPERSEDED | 訂正版がACTIVE | 通常分析から除外、履歴保持 |

SheetsはDBトランザクションを持たないため、PENDINGからACTIVEへの状態遷移で原子性を表現する。分析APIはACTIVE以外を読まない。IdentityStatusは保存整合性のStatusと分離し、UNRESOLVEDまたはAMBIGUOUSでも正本検証に合格すればACTIVEにできる。ただし、PersonIDが必要な個人推移とML出力からは除外し、単一回の集団集計だけに含める。

## 8 重複と訂正

- 同一PdfHash: 同一ファイルとして拒否し、既存ReportIDを返す。
- PdfHash違いかつ同一ExamEvent・ExamCandidateID: 訂正、再発行、別人衝突の候補としてADMIN確認へ送る。
- SemanticFingerprint一致: 同内容別PDFの重複候補。自動上書きしない。
- 訂正: 新Reportを作り、旧ReportをSUPERSEDEDへ変更する。旧payloadを書き換えない。
- LocationID相違: 誤選択の可能性があるため、自動統合せず確認する。

## 9 派生シート

`Aggregate_*` シートは速度改善のキャッシュであり正本ではない。集計定義版、対象DataFiles、最大ImportedAt、生成日時、行数、ハッシュを持ち、いつでも正本から再生成できるようにする。

分析画面は、少量範囲では正本を集計し、大量範囲では版が一致する派生シートを利用する。古い派生データを正しいものとして返さない。

## 10 容量・性能評価

Googleの公式Apps Script資料は、Sheetsが10 million cellsへ近づく場合に専用DBを検討し、Apps Scriptは通常6分/実行であるため、バッチ操作と処理分割を推奨している。設計上は上限まで使わず、次をPhase 1で測る。

| 指標 | 比較対象 | 暫定合格条件 |
|---|---|---|
| セル数 | 全行形式 / 科目別JSON / payload別JSON | JSON案が無損失で全行形式より十分少ない |
| 最大文字数 | 代表・最大合成帳票 | 40,000文字ガード内、超過時チャンク成功 |
| 登録時間 | 1件、連続件数、同時登録 | 実行6分へ十分な余裕。閾値はGAS試験時決定 |
| 分析時間 | 1年度、複数年度 | タイムアウト前に完了し、必要なら派生集計へ切替 |
| 復元時間 | 1件、100件相当 | UI待機許容値をPhase 2で決定 |
| 障害範囲 | チャンク欠落、改ざん、途中失敗 | 不完全Reportを分析へ含めない |

## 11 ML用CSV

ML CSVは正本からその都度生成する。端末以外へCSVファイルを保存しない。

- 直接識別子、ImportedBy、学校の詳細なクラス・校内番号を既定で除外する。
- ML_ID、ExamEventID、LocationIDの粒度、科目、特徴値、MissingReason、各種Versionを含める。
- LocationIDやSchoolIDが少人数を容易に特定する場合は、出力粒度を選択・警告する。
- ExportSchemaVersionで列順、型、欠損表現を固定する。
- IdentityStatusがRESOLVEDまたはNEW_CONFIRMEDでないReportは既定で除外し、除外件数を監査する。
- CSV数式注入を防ぎ、UTF-8 BOM有無等も版に含める。
- 出力者、目的、条件、件数、列集合、版、日時を監査し、CSV本文を監査ログへ保存しない。

## 12 未決事項

| ID | 論点 | 検証方法 |
|---|---|---|
| DATA-D01 | Person候補照合に使える項目 | 複数回帳票の項目安定性を合成例と追加実票で確認 |
| DATA-D02 | JSON分割単位 | 最大帳票の文字数・障害範囲・読出し時間を比較 |
| DATA-D03 | 年度・Part分割閾値 | セル数、ファイルサイズ、実行時間の実測で決定 |
| DATA-D04 | 学校・大学名称マスタ | 原表記と正規化IDの運用責任を決定 |
| DATA-D05 | ML_IDの鍵ローテーション | 年度継続性と漏えい時対応をADR化 |
| DATA-D06 | 小人数群の扱い | 会社承認で閾値と例外を決定 |

## 13 参考にする公式制約

- [Apps Script Quotas for Google Services](https://developers.google.com/apps-script/guides/services/quotas)
- [Apps Script Best Practices](https://developers.google.com/apps-script/guides/support/best-practices)
