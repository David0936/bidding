// 智标 BidForge 后端入口
import express from 'express';
import cors from 'cors';
import { ensureDirs } from './store/paths.js';
import { settingsRouter } from './routes/settings.js';

const PORT = Number(process.env.PORT ?? 8787);

ensureDirs();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'BidForge', version: '0.1.0' });
});

// 设置 / AI 配置
app.use('/api/settings', settingsRouter);

// 兜底错误处理
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server error]', err);
  res.status(500).json({ ok: false, message: err?.message ?? '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`[BidForge] 后端已启动: http://127.0.0.1:${PORT}`);
});
