# 开发任务书：M37a 分章解析 / M37b Word 排版 / M38 格式文件引擎 / M39 确定性校验

> 本文档是给开发执行方（Codex）的完整指令。按阶段顺序开发，**每完成一个阶段必须停下**：
> 自检通过后 `git commit`（一个阶段一个 commit，不要跨阶段混提交），输出自检报告，等统筹方（Claude）校验通过后再进入下一阶段。
> 禁止顺手重构本任务书范围之外的代码。

---

## 0. 项目背景（必读）

**项目**：`中集易标 easy bidding` —— AI 标书写作系统。从招标文件到投标文件成稿：解析 → 行业识别 → 响应矩阵 → 资料补齐 → AI 正文 → 总检 → 导出 Word/PDF → 电子盖章。

**技术栈**：npm workspaces 根目录 `bidding/`
- `server/`：Node + Express + TypeScript（tsx 运行，ESM，import 路径带 `.js` 后缀）
- `web/`：React 18 + Vite + TypeScript，无 UI 框架，样式全部在 `web/src/styles.css`
- 数据存储：本地文件系统 JSON（`server/data/projects/<id>/…`），无数据库
- 文档解析：`pdf-parse`（PDF）、`mammoth`（Word）、`exceljs`（Excel）；导出：`docx`、`pdf-lib`

**运行/构建**：
```bash
npm run dev          # 后端 8787 + 前端 5174
npm run build        # server tsc + web tsc -b && vite build（阶段自检必须通过）
```

**代码规范（严格遵守现有风格）**：
- 中文注释；文件头一行说明职责
- 分层：`server/src/projects/<domain>/<domain>Service.ts`（业务）+ `projectStore.ts`（读写落盘）+ `routes/projects.ts`（HTTP）
- 路由模式：`findOwnedProject(id, req)` 做账户隔离 → 404『项目不存在』；错误统一 `errorStatus(err)` / `errorMessage(err, '兜底文案')`；导出类接口先过 `requireFeature(req, res, 'export')`
- AI 调用统一走 `server/src/ai/jsonChat.ts` 的 `jsonChat<T>(config, { system, messages, temperature, feature })`，feature 命名如 `project.formatDocs`
- 前端：不可变更新（map/filter 复制树）、`api.ts` 统一封装 fetch（`jsonFetch`/`authFetch`）、类型放 `web/src/types.ts`（与 server 类型手工同步，两边都要改）

**回归样本**（已放好，勿提交到 git，`testdata/` 已在 .gitignore）：
- `testdata/样本1-新疆磋商文件.pdf` —— 10.9 万字符，政府采购磋商类；格式章在"第二章 响应文件格式"，评分办法在"第六章"（约全文 70% 处）
- `testdata/样本2-六盘水招标文件.docx` —— 5.4 万字符，工程设计类；格式章在"第五章 投标文件格式"（约全文 82% 处）

**背景问题（本任务书要解决的）**：目前所有 AI 提取环节把招标文件截断在前 22000 字符（各 service 里的 `MAX_TENDER_CHARS`），对上述两份真实样本，评分办法、投标文件格式章、技术需求全部在截断线之后 —— AI 实际没读到。

---

## 阶段一：M37a 招标文件分章解析

### 目标
把招标文件按章节切分索引，让每个 AI 环节按需读取**与它相关的章节全文**，替代『掐头 22000 字符』。

### 1.1 新模块 `server/src/projects/tenderChapters.ts`

```ts
export interface TenderChapter {
  id: string;            // ch_1 ch_2 …
  title: string;         // 如「第二章 响应文件格式」
  startLine: number;     // 在招标文件 Markdown 工作稿中的行号（1 起）
  endLine: number;
  charCount: number;
  /** 章节功能标签，可多个 */
  roles: ChapterRole[];
}

export type ChapterRole =
  | 'notice'        // 投标/磋商邀请、公告
  | 'instructions'  // 投标人/供应商须知（含前附表）
  | 'scoring'       // 评标/评审办法、评分细则
  | 'requirements'  // 采购需求/技术要求/设计清单
  | 'contract'      // 合同条款及格式
  | 'format'        // 投标文件格式/响应文件格式 ★M38 的输入
  | 'other';
```

- `detectTenderChapters(markdown: string): TenderChapter[]`：**纯规则实现，不调 AI**。识别行首的章节标题模式：`第X章`、`第X部分`、`第X篇`（X 为中文数字或阿拉伯数字），容忍标题后跟点号目录页（目录区域要排除：同一标题出现两次时取后一次即正文位置——参考样本1，目录在第 11-16 行、正文从第 20 行起）。
- `classifyChapterRole(title: string): ChapterRole[]`：关键词映射。`格式` → format；`评标|评审|评分` → scoring；`须知` → instructions；`需求|技术要求|技术规范|清单` → requirements；`合同` → contract；`邀请|公告` → notice。命中多个给多个。
- `getChapterText(markdown: string, chapters: TenderChapter[], roles: ChapterRole[], maxChars: number): string`：取指定 role 的章节拼接全文；超 maxChars 时**均匀截每章**（保留每章开头），并附注说明。找不到任何章节（无章节结构的短文件）时回退为整篇前 maxChars。

### 1.2 落盘与接口

- `projectStore.ts`：新增 `saveTenderChapters(id, chapters)` / `getTenderChapters(id)`，存 `data/projects/<id>/tender-chapters.json`。在招标文件上传解析完成处（`saveTender` 调用点之后，见 `routes/projects.ts` 的 `POST /:id/tender`）同步执行 `detectTenderChapters` 并落盘。选择标段（`selectBidSection`）后基于裁剪后的工作稿**重算**。
- `GET /api/projects/:id/tender-chapters`：返回章节列表（前端展示解析结果用，本阶段可不做前端 UI）。

### 1.3 接入现有 AI 环节（重点）

以下 service 目前都是 `tenderText.slice(0, MAX_TENDER_CHARS)`，改为按 role 取材（保持各自 MAX 字数预算不变，但取材来源变了）：

| service | 应取的 roles |
|---|---|
| `analysis/analysisService.ts`（需求明细+评分提取） | instructions + scoring + requirements |
| `responseMatrix/responseMatrixService.ts` | scoring + instructions + requirements |
| `materialChecklist/materialChecklistService.ts` | format + instructions（格式章就是最准的资料清单） |
| `outline/outlineService.ts` | requirements + scoring |
| `industryProfile/industryProfileService.ts` | notice + requirements（取不到就整篇头部，行业判断本来只需要开头） |

做法：各 service 函数签名增加可选参数 `chapters?: TenderChapter[]`，routes 调用处传入 `getTenderChapters(id)`；service 内用 `getChapterText(...)` 组料，chapters 为空时保持现有 slice 行为（向后兼容旧项目）。

### 1.4 自检（全部通过才算完成）

```bash
npm run build   # 必须 0 error
```
写一个临时脚本（跑完删除）验证两份样本：
1. 样本1 检出 ≥7 个章节；`format` 命中「第二章响应文件格式」；`scoring` 命中「第六章评审方法」
2. 样本2 检出 5 个章节；`format` 命中「第五章 投标文件格式」；`scoring` 命中「第二章 评标办法」
3. `getChapterText(样本1, ['scoring'], 22000)` 的返回内容包含「综合评分」相关文字（证明拿到了截断线之后的内容）

自检报告需附：两份样本的章节检出清单（title/行号/roles）。

---

## 阶段二：M37b Word 导出排版达标

### 目标
`buildDocx` 产出符合中国投标惯例的成品：封面 + 目录域 + 页眉页脚页码 + 中文字体样式。**PDF 导出本阶段只加页脚页码，其余不动。**

### 2.1 修改 `server/src/projects/export/exportService.ts`

- `BuildDocxOptions` 增加 `cover?: { projectName: string; docTitle: string; bidderName?: string; date?: string }`（不传则不出封面，兼容旧调用）
- **封面页**：项目名称（居中、二号加粗）、文档标题（如「投标文件（技术标）」）、投标人名称＋«（盖章）»占位、法定代表人＋«（签字或盖章）»占位、日期；封面后分页
- **目录页**：用 docx 库的 `TableOfContents`（Word 打开后按 F9 更新域），目录后分页
- **样式**：`Document.styles` 显式声明——正文宋体（`SimSun`）小四（24 half-points）、行距 1.5；标题黑体（`SimHei`）：H1 小二、H2 三号、H3 小三、H4 四号；表格字体宋体五号
- **页眉**：项目名称（小五、居中、灰色）；**页脚**：`第 X 页 共 Y 页`（用 `PageNumber.CURRENT` / `TOTAL_PAGES` 域），封面不编页码（封面用独立 section，`titlePage` 或分 section 处理）
- 路由 `GET /:id/export/docx`：组装 cover（projectName = project.name，bidderName 暂留空占位，docTitle 按分册后缀）

### 2.2 PDF 页码

`buildPdf` 完成正文后遍历 `doc.getPages()`，每页底部中央画 `第 X 页 / 共 Y 页`（9pt，灰色）。盖章版同样生效（盖章在页码之后绘制，互不影响）。

### 2.3 自检

1. `npm run build` 通过
2. 临时脚本用一个 3 章 outline 生成 docx，用 macOS `textutil -convert txt` 或解压 `word/document.xml` 检查：存在 `w:headerReference`、`TOC` 域、`SimSun` 字体声明、封面文字
3. 生成 PDF 确认每页有页码
4. 自检报告附生成的 docx/pdf 文件路径（放 `testdata/out/`，该目录也被 gitignore 覆盖）

---

## 阶段三：M38 格式文件引擎（本任务书核心）

### 目标
从每份招标文件的「格式」章提取文书模板 → 识别占位字段 → 用项目事实+投标主体档案填充 → 人工逐份复核 → 排入商务标分册导出。**不做硬编码模板库**——每个标的格式都不同（样本1 授权书是独立文书；样本2 是「身份证明和授权委托书」合体；样本2 承诺书标注「格式自拟」）。

### 3.1 投标主体档案（账户级，跨项目复用）

新模块 `server/src/bidder/bidderProfileStore.ts`，存 `data/bidder-profiles/<accountId>.json`：

```ts
export interface BidderProfile {
  companyName: string;          // 公司全称
  creditCode: string;           // 统一社会信用代码
  address: string;
  postcode?: string;
  phone: string;
  fax?: string;
  website?: string;
  bankName?: string;            // 基本开户行
  bankAccount?: string;
  legalRep: { name: string; gender?: string; age?: string; title?: string; idNumber?: string };
  agent?: { name: string; idNumber?: string; phone?: string };   // 常用委托代理人
  updatedAt: string;
}
```

- `GET/PUT /api/bidder-profile`（挂在新路由文件 `routes/bidderProfile.ts`，`app.ts` 注册；按 Bearer token 的 accountId 隔离，参考 `routes/knowledge.ts` 的做法）
- 前端：设置页（`web/src/pages/SettingsPage.tsx`）新增「投标主体档案」卡片，表单编辑保存。字段全部可留空。

### 3.2 格式文书提取

新模块 `server/src/projects/formatDocs/`（types.ts + formatDocsService.ts）：

```ts
export type FormatDocKind = 'letter' | 'table' | 'attachment' | 'freeform' | 'cover' | 'toc';
// letter=信函式(投标函/授权书/声明) table=表格式(报价一览表/简历表) attachment=贴凭证页 freeform=格式自拟 cover=封面 toc=格式章自带目录

export interface FormatField {
  key: string;              // 稳定标识，如 project_name / bid_amount_upper
  label: string;            // 原文中的占位说明，如「（供应商名称）」「大写：」
  source: 'project' | 'bidder' | 'manual';  // 自动来源：项目事实 / 主体档案 / 必须人工填
  value: string;            // 填充值（source=manual 时初始为空）
}

export interface FormatDoc {
  id: string;
  title: string;            // 如「一、投标函」「法定代表人授权委托书」
  kind: FormatDocKind;
  originalText: string;     // 招标文件中的原文模板（保真，Markdown）
  filledText: string;       // 填充稿（初始=AI填充结果，用户可改）
  fields: FormatField[];
  volume: 'business' | 'price' | 'technical';  // 归入哪个分册，默认 business
  status: 'draft' | 'confirmed';               // 用户逐份确认
  note?: string;            // 如「格式自拟」「需二次报价时提交」
}

export interface FormatDocsResult {
  sourceChapter: string;    // 来源章节标题
  docs: FormatDoc[];
  generatedAt: string;
  updatedAt: string;
}
```

`generateFormatDocs(config, formatChapterText, projectName, facts, bidderProfile)`：
- 输入是 M37a 提供的 `format` 章**全文**（`getChapterText(md, chapters, ['format'], 30000)`）
- AI 提示词要点：把格式章切分成独立文书；`originalText` 必须逐字保留原文（含表格行、括号占位、下划线空位），禁止改写/概括；识别占位并生成 fields，能对应到已知项目事实（项目名称/编号/工期等）或主体档案（公司名/法代/电话等）的自动填 `value` 并标 source，其余标 `manual` 留空；`filledText` = originalText 中已知字段就地替换后的文本，manual 字段保留原占位样式；判断 kind 和 volume（报价类→price）
- normalize 层（参考 `materialChecklistService.ts` 的 normalize 写法）：字段清洗、kind/volume/status 白名单、docs 上限 40

### 3.3 落盘与路由

- `projectStore.ts`：`saveFormatDocs(id, result)` / `getFormatDocs(id)`，存 `format-docs.json`
- 路由：
  - `POST /:id/format-docs/generate`（须已上传招标文件；找不到 format 章返回 400『未识别到投标文件格式章节，可能该招标文件未附格式要求』）
  - `GET /:id/format-docs`
  - `PUT /:id/format-docs/:docId`（更新 filledText / fields / status / volume）
  - `POST /:id/format-docs/apply`：把所有 `confirmed` 的文书按顺序转为大纲章节——在 outline 顶部插入一个「投标文件格式文书」一级章节（volume 按各文书归属拆），每个文书一个叶子节点，content = filledText；调 `saveOutline(id, …, { clearResponseMatrix: false })`。重复 apply 时先移除旧插入的节点再插（节点 id 用 `fmt_<docId>` 前缀识别）

### 3.4 前端工作台

`WorkspacePage.tsx` 在「资料补齐」步骤后新增步骤卡片「格式文书」：
- 「AI 提取格式文书」按钮 → 列表：每份文书显示 title、kind 徽标、volume、状态徽标
- 展开一份：左侧 originalText 只读（`<pre>` 或 MarkdownPreview），右侧 filledText 可编辑（textarea）+ fields 清单（manual 且空值的标红，输入后一键「重新套用字段」把 value 替换进 filledText 对应占位）
- 每份「确认」按钮 → status=confirmed；顶部「插入投标文件」按钮 → apply 接口 → 提示到目录/正文步骤查看
- `api.ts` 补对应方法；`types.ts` 同步类型；样式沿用现有 card/badge/mini-btn 类

### 3.5 自检

1. `npm run build` 通过
2. 两份样本各建一个项目走 API 全流程（可写临时脚本直接调 service 层）：
   - 样本1 提取出 ≥8 份文书，其中必须包含：报价一览表（table）、法定代表人授权委托书（letter）、近三年无重大违法声明（letter）、二次报价表
   - 样本2 提取出 ≥6 份文书，必须包含：投标函（letter）、法定代表人身份证明和授权委托书（合体，一份 letter）、承诺书（freeform，note 含「格式自拟」）
   - 抽查 2 份文书的 originalText 与招标文件原文逐字一致（允许空白差异）
   - 项目名称、编号等 project 字段已自动填充；公司名等 bidder 字段在主体档案填写后自动填充
3. apply 后导出商务标 docx，确认格式文书出现在开头
4. 自检报告附：两份样本提取出的文书清单（title/kind/volume/fields 数量/manual 缺口数量）

---

## 阶段四：M39 确定性校验（规则，不调 AI）

### 目标
把高频废标点做成确定性规则检查，进「废标项检查」与「提交前总检」。

### 4.1 新模块 `server/src/projects/checks/deterministicChecks.ts`

```ts
export interface DeterministicIssue {
  rule: string;         // amount_case_mismatch | amount_cross_ref | duration_conflict | validity_conflict | missing_seal_spot
  severity: 'blocker' | 'warning';
  message: string;      // 给用户看的中文说明，含具体数值与位置（章节标题）
}
export function runDeterministicChecks(outline: Outline, formatDocs: FormatDocsResult | null, tenderChapters: …): DeterministicIssue[]
```

规则：
1. **金额大小写一致**：全文（含 formatDocs.filledText）里成对出现的「小写：X 元 / 大写：Y」，实现数字→中文大写金额转换器（`壹贰叁肆伍陆柒捌玖拾佰仟万亿元角分整`，需处理零的规则），不一致报 blocker；只填了一边报 warning
2. **跨表金额一致**：提取所有「投标报价/报价一览/总报价」附近的金额，出现 ≥2 个不同值报 blocker
3. **工期/有效期响应**：从招标文件 instructions 章提取「工期/服务期/投标有效期」数值，与正文中承诺值比对，正文值超出招标要求报 blocker（提取失败则跳过，不误报）
4. **签章占位遗漏**：confirmed 的格式文书中仍残留「（盖章）（签字」且该文书没有关联盖章位置时报 warning

金额中文大写转换器必须配一组纯函数单测（写成临时脚本跑一遍即可，含：整数、带角分、含零、万/亿进位）。

### 4.2 接入

- `readiness/readinessService.ts`（提交前总检）：报告中新增「确定性校验」分组，blocker 计入阻断清单
- 前端总检面板展示该分组（沿用现有 issue 列表样式）

### 4.3 自检

构造含错样例验证：`小写：1,234,567.89 元 / 大写：壹佰贰拾叁万肆仟伍佰陆拾柒元捌角玖分` 判通过；改一个字判 blocker；两处报价不同判 blocker。报告附规则命中样例。

---

## 通用红线（每阶段都适用）

1. 不改既有 API 的请求/响应结构（只能新增字段），不动计费、鉴权、代理人、管理员模块
2. 不新增 npm 依赖；确需新增先在自检报告中说明理由，等校验方批准
3. 不删不改 `testdata/`；生成物放 `testdata/out/`
4. 每阶段一个 commit，message 格式 `feat(M37a): …`，正文列出改动文件清单
5. 阶段完成的定义：`npm run build` 零错误 + 该阶段自检全部通过 + 自检报告（写到 `docs/reports/M<阶段>-selfcheck.md`）

## 校验方（Claude）将做什么

每阶段 commit 后：diff 审查（分层/风格/红线）、重跑你的自检 + 独立的两样本回归（分章检出、格式文书保真度抽查、导出文件人工查看）、边界测试（无章节结构的短文件、未生成目录时调 apply、空主体档案）。校验不通过会给出修改清单，修完在同一阶段追加 commit。
