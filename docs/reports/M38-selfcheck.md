# M38 自检报告：格式文件引擎

## 范围

- 阶段：M38 格式文件引擎
- 目标：从招标文件格式章提取文书模板，识别字段，用项目事实和投标主体档案填充，人工确认后插入投标文件大纲。
- 主要文件：
  - `server/src/bidder/bidderProfileStore.ts`
  - `server/src/routes/bidderProfile.ts`
  - `server/src/projects/formatDocs/types.ts`
  - `server/src/projects/formatDocs/formatDocsService.ts`
  - `server/src/projects/projectStore.ts`
  - `server/src/routes/projects.ts`
  - `web/src/types.ts`
  - `web/src/api.ts`
  - `web/src/pages/SettingsPage.tsx`
  - `web/src/pages/WorkspacePage.tsx`
  - `web/src/styles.css`

## 自检命令

```bash
git -c http.version=HTTP/1.1 pull
npm run build
EASY_BIDDING_DATA_DIR="$PWD/testdata/out/m38-data" npx tsx - <<'TS'
// 解析 testdata/样本1-新疆磋商文件.pdf 与 testdata/样本2-六盘水招标文件.docx
// detectTenderChapters -> getChapterText(md, chapters, ['format'], 30000)
// generateFormatDocs -> 字段填充断言 -> Express apply 路由断言 -> buildDocx
TS
unzip -p testdata/out/m38-format-docs-business.docx word/document.xml | perl -0pe 's/<[^>]+>/ /g; s/\s+/ /g'
```

结果：

- `git pull`：已执行，main 当时为 up to date。
- `npm run build`：通过。
- 样本格式章取材：均使用 `getChapterText(md, chapters, ['format'], 30000)`。
- AI 元数据增强：自检环境未配置 API Key，走确定性切分和字段规则；这正好验证无模型时的稳定下限。
- Express `POST /api/projects/:id/format-docs/apply`：通过。
- DOCX 导出样件：`testdata/out/m38-format-docs-business.docx`，约 12 KB。

## 样本1 提取清单

文件：`testdata/样本1-新疆磋商文件.pdf`

来源章节：`第二章响应文件格式`

| title | kind | volume | fields | manual/empty |
|---|---|---|---:|---:|
| 1、报价一览表 | table | price | 6 | 4 |
| 二次报价表 | table | price | 6 | 4 |
| 资格审查资料 | letter | business | 8 | 4 |
| 法定代表人授权委托书 | letter | business | 9 | 3 |
| 4、具有良好的商业信誉和健全的财务会计制度的证明材料（提供 | letter | business | 1 | 1 |
| 6、参加采购活动前三年内在经营活动中无重大违法声明 | letter | business | 8 | 7 |
| 政府采购投标担保函 | letter | business | 7 | 6 |
| 9、落实政府采购政策需满足的资格要求（中小企业声明函） | letter | business | 16 | 15 |
| 监狱企业声明函 | letter | business | 10 | 8 |
| 1、竞争性磋商函 | letter | business | 9 | 7 |
| 3、质量保修书 | letter | business | 1 | 1 |
| 履约保证金签约合同价的5% | letter | business | 2 | 1 |
| 4、项目经理简历表 | table | business | 0 | 0 |
| 6、类似项目业绩表 | table | business | 4 | 3 |
| 7、商务偏离表 | table | technical | 10 | 8 |

关键断言：

- 文书数量 `15 >= 8`。
- 已包含 `报价一览表`，类型 `table`，分册 `price`。
- 已包含 `二次报价表`。
- 已包含 `法定代表人授权委托书`，类型 `letter`。
- 已包含 `参加采购活动前三年内在经营活动中无重大违法声明`，类型 `letter`。
- 抽查前 2 份 `originalText`，去空白后均可在格式章原文中找到。

## 样本2 提取清单

文件：`testdata/样本2-六盘水招标文件.docx`

来源章节：`第五章    投标文件格式`

| title | kind | volume | fields | manual/empty |
|---|---|---|---:|---:|
| 一、投标函 | letter | business | 9 | 6 |
| 二、法定代表人身份证明和授权委托书 | letter | business | 8 | 2 |
| 三、投标保证金 | letter | business | 0 | 0 |
| 四、承诺书 | freeform | business | 0 | 0 |
| 表一 设计负责人简历表 | table | business | 0 | 0 |
| 表二 主要参加人员表 | table | business | 0 | 0 |
| 表三 投标人（企业）业绩表 | table | business | 1 | 1 |
| 六、技术方案、设计策划及管理措施（格式自拟） | freeform | technical | 0 | 0 |
| 八、其他资料 | attachment | business | 1 | 0 |
| 附件1-5：分项报价单（详见附件1-5） | table | price | 1 | 1 |
| 商务及技术条款偏离表 | table | technical | 2 | 2 |

关键断言：

- 文书数量 `11 >= 6`。
- 已包含 `投标函`，类型 `letter`。
- 已包含 `法定代表人身份证明和授权委托书`，作为一份合体 `letter`，没有拆散。
- 已包含 `承诺书`，类型 `freeform`，备注含 `格式自拟`。
- 抽查前 2 份 `originalText`，去空白后均可在格式章原文中找到。
- `投标函.filledText` 已自动填入项目名 `中集新能（六盘水）科技有限公司数字化平台建设`。
- `授权委托书.filledText` 已自动填入主体档案公司名 `广州茂海信息科技有限公司`。
- 已填字段前无 Markdown 转义反斜杠残留；filledText 会清理 mammoth 生成的 `<a id=...></a>` 锚点，originalText 仍保真保存。

## Apply 与导出

路由自检构造一个已有目录：

- 顶部旧节点：`fmt_old`
- 原有业务节点：`keep_001`

执行 `POST /api/projects/:id/format-docs/apply` 后断言：

- 新目录第一项为 `fmt_format_docs`，标题 `投标文件格式文书`。
- 其下插入 2 个已确认文书节点。
- 旧 `fmt_old` 节点已在重复 apply 前移除。
- 原有 `keep_001` 节点仍保留。

随后调用 `buildDocx` 生成 `testdata/out/m38-format-docs-business.docx`，解包 `word/document.xml` 检查：

- 包含 `投标文件格式文书`。
- 包含 `一、投标函`。
- 包含 `法定代表人身份证明和授权委托书`。
- 包含 `广州茂海信息科技有限公司`。
- 包含 `中集新能（六盘水）科技有限公司数字化平台建设`。
- 不包含 `\广州茂海`、`\中集新能` 或 `&lt;a id=`。

## 结论

M38 当前满足任务书的核心验收口径：两份样本可从格式章切分出关键文书，`originalText` 保留可核对原文，项目字段和主体档案字段可自动填充，人工确认后的文书可稳定插入投标文件大纲并进入 Word 导出。
