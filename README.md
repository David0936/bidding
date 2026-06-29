# 智标 BidForge

> 原创、开源的 AI 标书写作工具。从招标文件到投标技术方案初稿，一条主链路走完：**文档解析 → AI 生成目录 → AI 生成正文 → 导出 Word**。

本项目为完全原创实现（MIT 协议），不复用任何第三方标书工具的代码，仅在产品逻辑与功能形态上对标同类工具。

## ✨ 特性

- **双格式 AI 接入**：同时支持「OpenAI 兼容」（DeepSeek / GPT / 火山方舟 / Ollama 等）与「Claude」（Anthropic Messages）两种格式，可分别配置、一键切换、连通测试。
- **本地优先**：API Key 与生成数据只保存在本机，不上传任何服务器。
- **主链路工作台**：上传招标文件 → 生成目录 → 生成正文 → 导出 Word（功能逐步上线中）。
- **Web 架构**：React + Vite 前端 / Node + Express 后端，开发与部署都很轻。

## 🧱 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite |
| 后端 | Node.js + Express + TypeScript（tsx） |
| 文档解析 | pdf-parse（PDF）、mammoth（Word） |
| 导出 | docx |
| AI | OpenAI 兼容 `/chat/completions`、Claude `/v1/messages` |

## 📁 目录结构

```
bidding/
├── server/                 # 后端
│   └── src/
│       ├── index.ts        # 入口
│       ├── ai/             # AI 提供方抽象（openai + claude 归一化）
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

打开浏览器访问 **http://127.0.0.1:5174**，先到「设置」配置 AI 模型并测试连通。

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
- [ ] M2 招标文件上传与解析（PDF / Word → 文本）
- [ ] M3 AI 生成标书目录（可编辑）
- [ ] M4 按目录逐章节生成正文
- [ ] M5 导出 Word
- [ ] 后续：知识库、标书查重、废标项检查、桌面端打包

## 📄 许可证

[MIT](LICENSE)
