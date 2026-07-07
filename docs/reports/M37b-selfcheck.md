# M37b 自检报告：Word/PDF 导出排版

## 范围

- 阶段：M37b Word 导出排版达标
- 相关提交：`634348f feat: improve bid export formatting`
- 主要文件：
  - `server/src/projects/export/exportService.ts`
  - `server/src/routes/projects.ts`

## 自检命令

```bash
npm run build
npx tsx -e '/* 构造 3 章 outline，调用 buildDocx/buildPdf 写入 testdata/out/m37b-export-check.docx 和 .pdf */'
node - <<'NODE'
// 解压 docx，断言 document.xml/styles.xml/rels 中存在封面、TOC、页眉页脚和字体声明
NODE
python3 - <<'PY'
# 用 pypdf 断言 PDF 每页包含「第 X 页 / 共 Y 页」
PY
```

结果：

- `npm run build`：通过
- `git diff --check`：通过
- DOCX 结构断言：通过
- PDF 页码断言：通过，测试文件共 9 页，每页均含对应页码
- PDF PNG 渲染：通过，抽查第 1、5、9 页无明显重叠、遮挡、页码缺失

## 生成物

生成物位于 `testdata/out/`，该目录被 gitignore 覆盖，不提交：

- `testdata/out/m37b-export-check.docx`
- `testdata/out/m37b-export-check.pdf`
- `testdata/out/m37b-pdf-render/page-1.png` 至 `page-9.png`

## DOCX 结构断言

通过解压 `word/document.xml`、`word/styles.xml`、`word/_rels/document.xml.rels` 检查：

| 检查项 | 结果 |
|---|---|
| 封面项目名称 | 通过 |
| 封面文档标题 | 通过 |
| 投标人名称/盖章占位 | 通过 |
| `TOC` 目录域 | 通过 |
| `headerReference` | 通过 |
| `footerReference` | 通过 |
| `pgNumType` 页码重置 | 通过 |
| `SimSun` 正文字体声明 | 通过 |
| `SimHei` 标题字体声明 | 通过 |
| `w:line="360"` 1.5 倍行距 | 通过 |

## PDF 页码断言

测试 PDF 共 9 页，逐页断言如下：

| 页码 | 期望文本 | 结果 |
|---:|---|---|
| 1 | 第 1 页 / 共 9 页 | 通过 |
| 2 | 第 2 页 / 共 9 页 | 通过 |
| 3 | 第 3 页 / 共 9 页 | 通过 |
| 4 | 第 4 页 / 共 9 页 | 通过 |
| 5 | 第 5 页 / 共 9 页 | 通过 |
| 6 | 第 6 页 / 共 9 页 | 通过 |
| 7 | 第 7 页 / 共 9 页 | 通过 |
| 8 | 第 8 页 / 共 9 页 | 通过 |
| 9 | 第 9 页 / 共 9 页 | 通过 |

## 限制说明

DOCX 视觉渲染尝试使用 bundled LibreOffice 时失败，原因是运行时缺少绝对路径依赖：

```text
/opt/homebrew/opt/little-cms2/lib/liblcms2.2.dylib
```

因此本阶段 DOCX 未完成 PNG 视觉 QA，已用 OOXML 结构检查补充验证；PDF 已用 Poppler 渲染 PNG 并抽查通过。

## 结论

M37b 当前满足任务书中封面、目录域、页眉页脚页码、中文字体样式和 PDF 页码要求。盖章 PDF 的执行顺序为先绘制页码，再绘制电子章。
