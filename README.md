# 中集易标 easy bidding

> AI 标书写作系统。从招标文件到投标技术方案初稿，一条主链路走完：**文档解析 → 行业识别 → 响应矩阵 → 资料补齐 → AI 生成正文 → 提交前总检 → 导出 Markdown/Word/PDF → 电子盖章**。
>
> 由 **中集数科（CIMC Digital Energy Technology）** 出品。

本项目为完全原创实现（MIT 协议），不复用任何第三方标书工具的代码，仅在产品逻辑与功能形态上对标同类工具。

## ✨ 特性

- **双格式 AI 接入**：同时支持「OpenAI 兼容」（DeepSeek / GPT / 火山方舟 / Ollama 等）与「Claude」（Anthropic Messages）两种格式，可分别配置、一键切换、连通测试。
- **本地优先**：API Key 与生成数据只保存在本机，不上传任何服务器。
- **主链路工作台**：上传招标文件 → 识别/选择标段分包 → 解析关键项 → 行业/采购类型识别 → 生成目录 → 设定全局事实 → 响应矩阵 → 资料补齐 → 生成正文 → 提交前总检 → 导出 Markdown/Word/PDF → 电子盖章。
- **上传即解读**：客户上传招标文件后，系统自动进入解析流水线，依次完成原文解析、需求明细提取、行业/采购类型判断，减少新手操作步骤。
- **行业/采购类型画像**：AI 根据招标书自动判断软件信息化、电力能源、基建、市政交通、安防弱电、工业制造等行业，以及工程/货物/服务/软件/设备/EPC 等采购对象，并输出资料重点、响应重点和风险重点。
- **资料补齐清单**：AI 根据招标文件梳理营业执照、授权、保证金、报价、业绩、财务、人员、技术参数等需上传材料；客户按项上传后自动补充到对应章节生成上下文。
- **商务/技术偏离表**：根据响应矩阵生成偏离表草稿，区分商务/技术、无偏离/待确认/不适用，并给出定稿前处理建议。
- **投标工作表导出**：响应矩阵、偏离表、资料补齐清单、提交前总检均可导出 Markdown/CSV，便于商务、技术、项目经理和客户方线下复核。
- **导出与签章**：支持导出 Markdown 工作稿、`.docx`、普通 PDF；支持上传 PNG/JPG 电子章，在 A4 页面任意位置放置并导出盖章版 PDF。
- **提交前总检**：汇总响应缺口、必需资料、正文完成度、一致性审计和盖章位置，形成总分、提交状态和阻断/高风险处理清单。
- **业务检查工具**：内置标书查重、废标项检查、知识库辅助生成、全文一致性审计。
- **会员 + 额度计费**：内置试用/基础/VIP/企业套餐、功能权限、项目数上限、充值/消费流水和 AI 额度扣点。
- **客户账户隔离**：邮箱注册/登录、Bearer token 会话，项目与知识库按客户账户隔离。
- **管理员后台**：模型配置仅管理员可见；支持线下公对公收款后手工开通套餐、分配额度。
- **客户运营管理**：管理员可按客户名称、邮箱、账户 ID 或备注检索账户，维护备注，并暂停/恢复客户 AI 使用权限。
- **桌面化预留**：已接入 Electron + electron-builder + electron-updater，后续可发布 Win/Mac 安装包。
- **Web + Desktop 架构**：React + Vite 前端 / Node + Express 后端，桌面版复用同一套业务 API。

## 🧱 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite |
| 后端 | Node.js + Express + TypeScript（tsx） |
| 文档解析 | pdf-parse（PDF）、mammoth（Word） |
| 工作稿 | Markdown 文件化存储（招标文件、原方案、知识库文档） |
| 导出 | docx、pdf-lib、@pdf-lib/fontkit |
| AI | OpenAI 兼容 `/chat/completions`、Claude `/v1/messages` |
| 账号/计费 | 本地 JSON 用户库、会员套餐/功能权限/额度账本、管理员手工入账；AI 调用统一扣点 |
| 桌面端 | Electron + electron-builder + electron-updater |
| 本地存储 | 开发期文件系统 JSON；桌面版数据目录可切到用户目录 |

## 技术路线对照

参考项目 `FB208/OpenBidKit_Yibiao` 从本地 `client/package.json` 看，主要是 Electron 桌面应用：Electron、React、TypeScript、Vite、electron-builder、electron-updater、better-sqlite3、Radix UI、mammoth/pdf-parse/pdfjs、docx 等。

当前项目采用原创实现，不复制参考仓库源码。现阶段技术路线是：

- Web/Server 先行：React + Vite 做界面，Express 承载 AI、解析、导出、检查等业务能力。
- SaaS 计费：客户登录后按账户隔离项目、知识库与额度账本；当前按线下公对公收款运营，管理员确认到账后在后台开通套餐、设置 VIP 到期日、分配额度；服务端统一校验套餐功能权限并在 AI 调用门面扣额度。
- 桌面封装：Electron 主进程嵌入同一个 Express 应用，生产版把 `web/dist` 作为静态前端加载。
- 更新能力：通过 `electron-updater` + GitHub 发布通道保留版本更新能力，后续补齐签名、公证、安装确认和发布流水线。

## 📁 目录结构

```
bidding/
├── electron/               # Electron 主进程、预加载、桌面更新桥接
├── server/                 # 后端
│   └── src/
│       ├── app.ts          # Express 应用工厂（Web/桌面复用）
│       ├── index.ts        # 独立后端启动入口
│       ├── ai/             # AI 提供方抽象（openai + claude 归一化）
│       ├── auth/           # 客户注册、登录、Bearer token 会话
│       ├── billing/        # 额度账户、充值流水、AI 用量扣费
│       ├── knowledge/      # 知识库
│       ├── projects/       # 项目、解析、目录、正文、审计
│       ├── routes/         # 接口路由
│       └── store/          # 本地配置/数据存储
├── web/                    # 前端
│   └── src/
│       ├── App.tsx
│       ├── api.ts          # 后端接口封装
│       └── pages/          # 工作台、设置页
└── package.json            # npm workspaces 根
```

## 🚀 本地运行

需要 Node.js 18+（推荐 20/22）。

```bash
cd bidding
npm install          # 安装前后端依赖（workspaces）
npm run dev          # 同时启动后端(8787) 和前端(5174)
```

打开浏览器访问 **http://127.0.0.1:5174**。客户可直接注册/登录；管理员从登录页「管理员后台」进入，使用 `EASY_BIDDING_ADMIN_SECRET` 登录后配置模型和客户额度。开发脚本内置本地默认管理员密钥 `admin123456`，正式部署请务必设置自己的 `EASY_BIDDING_ADMIN_SECRET`。

订阅/充值相关环境变量：

```bash
EASY_BIDDING_TRIAL_CREDITS=200              # 新账户初始化试用额度
EASY_BIDDING_CREDITS_PER_1K_TOKENS=1        # 每 1000 tokens 扣除点数
EASY_BIDDING_MIN_AI_CHARGE_CREDITS=0.1      # 单次 AI 调用最低扣费
EASY_BIDDING_DEFAULT_ACCOUNT_ID=default     # 未接登录系统时的默认账户
EASY_BIDDING_BILLING_ENABLED=true           # 设为 false 可临时关闭扣费
EASY_BIDDING_CENTS_PER_CREDIT=100           # 每 1 点额度对应金额（分）
EASY_BIDDING_PAYMENT_CURRENCY=CNY           # 订单币种
EASY_BIDDING_ALLOW_SELF_RECHARGE=false      # 演示环境可设 true；生产不要开放
EASY_BIDDING_ALLOW_MOCK_PAYMENT=false       # 演示环境可设 true；允许前端确认订单支付
EASY_BIDDING_ADMIN_SECRET=change-me         # 后台/支付回调人工入账密钥
EASY_BIDDING_DEV_ADMIN_SECRET=admin123456   # 仅本地开发默认密钥；生产不要依赖它
EASY_BIDDING_PAYMENT_WEBHOOK_SECRET=secret  # 通用支付回调 HMAC 密钥
```

当前建议运营方式：客户线下公对公转账 → 管理员进入「管理员后台」→ 选择客户账户 → 开通试用/基础/VIP/企业套餐 → 设置到期日、项目数上限和功能权限 → 手工分配额度。客户侧看不到模型供应商、Base URL、模型名或 API Key 状态。

生产部署时不要让客户直接调用充值入账接口，也不要开启 `EASY_BIDDING_ALLOW_MOCK_PAYMENT`。第三方支付回调能力保留为后续扩展：客户创建充值订单 → 跳转第三方收银台 → 第三方支付成功回调 → 服务端校验签名 → 确认订单支付并入账。

通用支付回调接口：

```text
POST /api/billing/payment-webhook/generic
Header: x-easy-bidding-signature: sha256=<HMAC_SHA256(rawBody, EASY_BIDDING_PAYMENT_WEBHOOK_SECRET)>
Body: { "orderId": "ord_xxx", "status": "paid", "amountCents": 10000, "currency": "CNY", "providerTradeNo": "第三方流水号" }
```

服务端会校验签名、订单金额与币种；校验通过后才把订单置为 `paid` 并生成充值流水。管理员账单总览接口为 `GET /api/billing/admin/overview`，需要请求头 `x-easy-bidding-admin-secret`。

桌面开发预览：

```bash
npm run dev:desktop
```

桌面打包（需要先完成对应平台签名/发布配置后用于正式分发）：

```bash
npm run dist:mac
npm run dist:win
```

单独启动：

```bash
npm run dev -w server   # 仅后端
npm run dev -w web      # 仅前端
```

## 🔌 配置 AI

在「设置」页二选一并填写：

- **OpenAI 兼容**：Base URL（如 `https://api.deepseek.com/v1`）、模型名、API Key。
- **Claude**：Base URL（`https://api.anthropic.com`）、模型名（如 `claude-sonnet-4-6`）、API Key。

点击「测试连通」验证配置是否可用，再「保存配置」。

## 🗺️ 路线图

- [x] M1 项目骨架 + 双格式 AI 配置 + 连通测试
- [x] M2 招标文件上传与解析（PDF / Word / txt / md → Markdown 工作稿）
- [x] M3 AI 解析招标文件关键项（项目、甲方、交付服务、评分要求、废标风险）
- [x] M4 AI 生成标书目录（可编辑）
- [x] M5 全局事实设定（统一项目名称、周期、地点、服务承诺等）
- [x] M6 按目录逐章节生成正文（一键全生成 / 单节重写 / 手动编辑）
- [x] M7 导出 Markdown 工作稿与 Word（.docx，带标题层级）
- [x] M8 知识库、标书查重、废标项检查、全文一致性审计
- [x] M9 桌面端基础封装与更新通道预留
- [x] M10 额度账户、按 AI token 用量扣费、充值流水、余额不足拦截
- [x] M11 客户注册/登录、项目与知识库按账户隔离
- [x] M12 充值订单、订单状态流转、演示支付确认、支付确认后入账
- [x] M13 通用支付回调 HMAC 验签、金额/币种校验、管理员账单总览接口
- [x] M14 管理员独立登录、模型配置后台化、客户不可见模型、线下公对公手工分配额度
- [x] M15 导出 PDF、上传电子章、按页面任意位置加盖并导出盖章 PDF
- [x] M16 生成后的整份标书可导出为 Markdown，便于版本比对和模板二次加工
- [x] M17 多标段/分包识别与投标范围工作稿，选择范围后清空下游生成结果并保留原文全文参考
- [x] M18 管理员客户检索、运营备注、账户暂停/恢复
- [x] M19 会员套餐、VIP 到期日、项目数上限和功能权限拦截
- [x] M20 套餐到期提醒、有效权益降级显示、后台临期/过期统计
- [x] M21 点对点响应矩阵：评分点/废标项/商务技术条款拆解、责任角色分配、正文覆盖检查
- [x] M22 资料补齐清单：AI 梳理客户需上传材料、按项上传解析、正文生成自动引用对应资料
- [x] M23 招标书行业/采购类型自动识别：自动判断行业、采购对象、资料重点、响应重点和风险重点，并接入矩阵、资料清单和正文生成
- [x] M24 提交前总检：汇总响应矩阵、资料清单、正文完成度、一致性审计和盖章位置，输出提交状态、总分和阻断/高风险清单
- [x] M25 商务/技术偏离表：根据响应矩阵生成偏离表草稿，标记无偏离、待确认和不适用项，并提示定稿处理动作
- [x] M26 投标工作表导出：响应矩阵、偏离表、资料补齐清单、提交前总检支持 Markdown/CSV 导出，方便团队复核和客户资料跟踪
- [x] M27 上传后自动解读标书：文件上传完成后自动提取需求明细并识别行业/采购类型，前端展示三段式解析进度，保留手动重试入口
- [ ] 后续：订单发票、续费自动通知、具体微信/支付宝/Stripe SDK 接入、桌面图标格式、Win/Mac 签名公证、自动更新发布流水线、Word 模板中心与更多质量规则

至此主链路（上传解析 → 选择投标范围 → 行业识别 → 响应矩阵 → 资料补齐 → 生成正文 → 提交前总检 → 导出 Markdown/Word/PDF → 电子盖章）已打通。

## 📄 许可证

[MIT](LICENSE)
