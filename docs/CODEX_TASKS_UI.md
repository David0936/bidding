# 开发任务书：阶段 UI —— 按「花叔Design」方法论重构界面

> 执行方（Codex）注意：本阶段**插在 M37a 校验通过之后、M37b 之前**执行（M37b/M38 见 `CODEX_TASKS_M37-M39.md`）。
> 一个 commit（`feat(UI): …`），完成后停下等统筹方校验。
> **本阶段只动表现层**：允许改 `web/src/styles.css`、`web/index.html`、TSX 里的 className/布局结构/图标；
> **禁止**改任何业务逻辑、state、handler、`api.ts`、`types.ts`、server 端任何文件。diff 里出现这些文件即校验不通过。

---

## 0. 背景与设计基调（必读）

设计方法论来自 [alchaincyf/huashu-design](https://github.com/alchaincyf/huashu-design)。本项目 2026-06-29 已按该方法论做过一轮主题（现行 `web/src/styles.css` 文件头「中集易标 政企案牍」），**主视觉方向已由产品负责人拍板：保留中集数科蓝（`--accent: #075FD9`）**，不换赤陶红。

参考材料（已在仓库内）：
- `docs/design/styles_spec.css` —— 早期完整规格。⚠️ 它是赤陶红色值版本，**色值一律不采用**；采用的是它的 token 命名法、组件覆盖思路、注释风格
- `docs/design/component_changes.md` —— 早期组件改造清单（基于 4 步旧界面，行号已全部失效，只作思路参考）
- `docs/design/icons.txt` —— 线性图标集（大部分已进 `web/src/components/Icons.tsx`）
- `docs/design/style-ref-takram.png` —— 版式气质参考图

### 反 AI slop 红线（每条都要过终检）

| 禁止 | 说明 |
|---|---|
| 渐变背景/渐变按钮 | 现状已是 0，保持 0 |
| emoji 作图标或状态符 | 图标一律用 `Icons.tsx` 线性 SVG（1.6 描边、currentColor）；缺的图标从 `docs/design/icons.txt` 风格续画 |
| 圆角卡片+左彩色 border accent | 卡片语义用背景/描边区分，不用左彩条 |
| 紫色系、霓虹 glow | 任何场景不引入 |
| 状态只靠颜色区分 | 所有 ok/err/warn 必须「图标+文字+色」三重编码（色弱可辨） |
| 凭空发明新颜色 | 只允许使用 `:root` token；**发现任何硬编码色值都要改成 token 引用** |

### 排印规则（来自 huashu typography.md，落到本项目）

- 标题（h1/h2/h3、卡片标题、step 标题）用 `--font-serif`（Noto Serif SC → Songti 回退）；正文/表单/表格用 `--font-sans`
- UI 正文 14px 基准已定，保持；长文阅读区（招标文件预览、Markdown 预览、正文编辑）17px、行高 1.75、`max-width: 36em`（中文行长 28-32 字最佳）
- 字号音阶不超过 5 档，禁止随手写新字号——如需新字号先看现有档位能否复用
- 中文文案引号统一「」；界面文案里的全角＋、●、○、✅、❌ 等字符符号一律换成 SVG 图标或删除

---

## 1. 任务A：Token 回归（技术债清理）

近期新增的组件样式（styles.css 尾部约 160 行，从注释「富文本编辑器工具栏与预览」开始）使用了硬编码色值，全部改为 token：

```bash
# 自查命令：以下命中数在改造后应为 0（:root 定义区除外）
grep -n "#3d56e0\|#8a94ad\|#4a5670\|#1f2940\|#6b7590\|#666666\|#33405e" web/src/styles.css
grep -n "rgba(96, 116, 168\|rgba(79, 105, 255" web/src/styles.css
```

涉及类：`.editor-toolbar` `.mini-btn-active` `.content-preview` `.md-preview`（含 table/image 子类）`.material-scan-toggle` `.material-insert-select` `.outline-volume` `.export-volume-bar`。改造时顺带按第 0 节排印规则核对这些组件（如 `.md-preview` 应有 `max-width: 36em`、17px、衬线小标题）。

## 2. 任务B：工作台信息架构（本阶段核心）

`WorkspacePage.tsx` 目前是 10 个步骤卡片纵向长滚动（约 3000 行 TSX），用户找不到自己在流程里的位置。改造为：

1. **粘性流程导航条**：page-header 之下加 `.flow-bar`（`position: sticky; top: 0`），渲染 10 个 `.flow-chip`：`01 上传招标 / 02 投标范围 / 03 需求解析 / 04 行业画像 / 05 目录 / 06 全局事实 / 07 响应矩阵 / 08 资料补齐 / 09 正文 / 10 总检导出`。
   - 每个 chip 三态：`data-done`（该步已有产出，判定沿用各卡片现有的条件变量，如 `!!current?.tender`、`!!outline`、`!!responseMatrix`）、`data-current`（第一个未 done 的步）、默认（未完成）
   - 点击 chip 平滑滚动到对应卡片锚点（卡片加 `id="step-01"` 等；`scrollIntoView({ behavior: 'smooth' })`）
   - chip 序号用 `--font-mono` 两位补零，done 态显示 check 图标
   - **纯展示层**：不得改动任何步骤的渲染条件和数据流
2. **步骤卡片头统一**：现有 `.step-head`（step-no + h2 + hint）保持结构，视觉按衬线标题落地；step-no 用衬线数字（条款编号感）
3. 窄屏（<960px）flow-bar 横向滚动，不换行堆叠

## 3. 任务C：十页一致性巡检

对全部页面逐一过检（`AuthPage / WorkspacePage / SettingsPage / KnowledgeBasePage / DuplicateCheckPage / RejectionCheckPage / ProjectManagementPage / BillingPage / AgentPage / AdminPage`）：

每页检查清单：
- [ ] 标题层级用衬线、正文用 sans，无游离字号
- [ ] 所有按钮走 `.btn/.btn-primary/.btn-ghost/.mini-btn` 体系，图标+文字（图标在前），无字符符号
- [ ] 空态：有引导文案的 `.empty-tip`（不是空白）；加载态：按钮文案「…中」+ disabled（现有模式，补漏）；错误态：`.result.err` + alert 图标
- [ ] badge 语义正确：成功 `badge-on`、警示 `badge-warn`、中性 `badge-off`，都带图标或可辨文字
- [ ] 表格（矩阵/偏离表/账单/清单）：表头 `--surface-2` 底、行 hover、数字列右对齐、等宽字体用于金额和编号
- [ ] 长列表（项目列表、知识库、资料清单）行密度统一（`--space-3` 纵向节奏）

发现的每一处修改在自检报告里列一行（页面/类名/改了什么），不要默默改。

## 4. 任务D：品牌与入口

- `index.html`：确认 Noto Serif SC webfont link 存在（无则加，用 `<link>` 不用 `@import`）；title 保持「中集易标 easy bidding」
- 侧栏品牌区：保持「中集易标」文字 + 现有 brand-mark；副标「AI 标书写作系统」
- 登录页（AuthPage）与工作台同一套 token，登录卡片衬线标题——第一眼就是同一个产品

## 5. 自检与交付

1. `npm run build` 零错误
2. 任务A 的两条 grep 命中为 0（`:root` 除外）；`grep -rn "linear-gradient" web/src/styles.css` 为 0；`grep -rnP "[\x{1F300}-\x{1FAFF}\x{2700}-\x{27BF}✅❌●○]" web/src/**/*.tsx` 为 0
3. `npm run dev` 起服务，手工走查：登录 → 工作台十步滚动 + flow-bar 跳转 → 设置 → 知识库 → 查重 → 项目管理 → 额度中心，每页无布局破损
4. 自检报告 `docs/reports/UI-selfcheck.md`：任务C 的逐页修改清单 + flow-bar 三态说明 + grep 输出贴图

## 校验方将做什么

diff 审查（红线：只许动表现层三类文件）→ 复跑 grep 终检 → 起 dev server 逐页截图走查（含 <960px 窄屏）→ 抽查 flow-bar 的 done 判定是否与卡片渲染条件一致 → 回归点按：上传/生成/导出按钮全部可点且行为不变。
