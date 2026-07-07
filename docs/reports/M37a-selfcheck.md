# M37a 自检报告：招标文件分章解析

## 范围

- 阶段：M37a 招标文件分章解析
- 相关提交：`8672632 feat: add tender chapter indexing`，后续 role 修复 `6277f36 fix(M37a): contract-format chapters no longer misclassified as format role`
- 主要文件：
  - `server/src/projects/tenderChapters.ts`
  - `server/src/projects/projectStore.ts`
  - `server/src/routes/projects.ts`
  - `server/src/projects/analysis/analysisService.ts`
  - `server/src/projects/outline/outlineService.ts`
  - `server/src/projects/responseMatrix/responseMatrixService.ts`
  - `server/src/projects/materialChecklist/materialChecklistService.ts`
  - `server/src/projects/industryProfile/industryProfileService.ts`

## 自检命令

```bash
npm run build
npx tsx -e 'import assert from "node:assert/strict"; import fs from "node:fs"; import { parseDocument } from "./server/src/projects/docParser.ts"; import { detectTenderChapters, getChapterText } from "./server/src/projects/tenderChapters.ts"; /* 两样本章节断言 */'
```

结果：

- `npm run build`：通过
- 样本章节断言：通过
- `getChapterText(样本1, ['scoring'], 22000)` 包含「综合评分」：通过
- 样本2「评标办法」正文无 `第X章` 前缀时，按目录章名候选识别为第二章：通过
- 样本2 第四章内部章号回跳的嵌入技术需求书未误切顶层章：通过

## 样本1 章节检出清单

文件：`testdata/样本1-新疆磋商文件.pdf`

| 标题 | 行号 | roles | 字符数 |
|---|---:|---|---:|
| 第一章供应商须知 | 20-642 | instructions | 15471 |
| 第二章响应文件格式 | 643-1186 | format | 10169 |
| 第三章投标邀请 | 1187-1288 | notice | 2497 |
| 第四章供应商须知前附表 | 1289-1536 | instructions | 4886 |
| 第五章采购需求 | 1537-1580 | requirements | 963 |
| 第六章评审方法（综合评分法） | 1581-1823 | scoring | 4451 |
| 第七章合同条款及格式 | 1824-4961 | contract | 70149 |

关键断言：

- 检出章节数 `7 >= 7`
- `format` 命中「第二章响应文件格式」
- `scoring` 命中「第六章评审方法」
- 评分章节取材包含「综合评分」
- 合同条款章节未因标题含「格式」误标为 `format`

## 样本2 章节检出清单

文件：`testdata/样本2-六盘水招标文件.docx`

| 标题 | 行号 | roles | 字符数 |
|---|---:|---|---:|
| 第一章 投标人须知 | 27-522 | instructions | 11122 |
| 第二章 评标办法 | 523-598 | scoring | 2282 |
| 第三章  合同条款及格式 | 599-980 | contract | 10489 |
| 第四章    工程技术要求及工程规范 | 981-1614 | requirements | 27489 |
| 第五章    投标文件格式 | 1615-1975 | format | 2597 |

关键断言：

- 检出章节数 `5`
- `format` 命中「第五章 投标文件格式」
- `scoring` 命中「第二章 评标办法」
- 第四章起止行覆盖嵌入的「第二章 项目现状与需求分析」至「第六章 质量保障」，未被章号回跳拆开
- 第三章合同条款未因标题含「格式」误标为 `format`

## 结论

M37a 当前在两份回归样本上满足任务书要求，后续 M38 必须使用：

```ts
getChapterText(markdown, chapters, ['format'], 30000)
```

作为格式文书提取输入。
