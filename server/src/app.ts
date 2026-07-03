// 中集易标 easy bidding 后端应用工厂。
// Web 开发、命令行启动、Electron 桌面版都会复用这一套 API。
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ensureDirs } from './store/paths.js';
import { settingsRouter } from './routes/settings.js';
import { projectsRouter } from './routes/projects.js';
import { checksRouter } from './routes/checks.js';
import { knowledgeRouter } from './routes/knowledge.js';
import { billingRouter } from './routes/billing.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { agentsRouter } from './routes/agents.js';
import { createRequestContextMiddleware } from './billing/requestContext.js';

export interface CreateAppOptions {
  staticDir?: string;
  enableCors?: boolean;
}

export function createApp(options: CreateAppOptions = {}): express.Express {
  ensureDirs();

  const app = express();
  const enableCors = options.enableCors ?? true;

  if (enableCors) {
    app.use(cors());
  }

  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(createRequestContextMiddleware());

  // 健康检查
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: 'Yibiao', version: '0.1.0' });
  });

  // 客户账号 / 登录令牌
  app.use('/api/auth', authRouter);

  // 管理员后台登录
  app.use('/api/admin', adminRouter);

  // 设置 / AI 配置
  app.use('/api/settings', settingsRouter);

  // 标书项目（创建、上传解析招标文件等）
  app.use('/api/projects', projectsRouter);

  // 知识库
  app.use('/api/knowledge', knowledgeRouter);

  // 额度账户 / 充值 / 用量流水
  app.use('/api/billing', billingRouter);

  // 标书检查工具（查重、废标项检查等）
  app.use('/api/checks', checksRouter);

  // 代理人 / 推广线索
  app.use('/api/agents', agentsRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, message: '接口不存在' });
  });

  const staticDir = options.staticDir ? path.resolve(options.staticDir) : '';
  const indexFile = staticDir ? path.join(staticDir, 'index.html') : '';

  if (staticDir && fs.existsSync(indexFile)) {
    app.use(express.static(staticDir));
    app.get('*', (_req, res) => {
      res.sendFile(indexFile);
    });
  }

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = typeof err?.status === 'number' ? err.status : 500;
    if (status >= 500) {
      console.error('[server error]', err);
    }
    res.status(status).json({ ok: false, message: err?.message ?? '服务器内部错误' });
  };
  app.use(errorHandler);

  return app;
}
