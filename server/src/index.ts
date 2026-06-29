// 中集易标 easy bidding 后端独立启动入口
import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 8787);
const staticDir = process.env.EASY_BIDDING_WEB_DIST;

const app = createApp({ staticDir });

export const server = app.listen(PORT, () => {
  console.log(`[易标] 后端已启动: http://127.0.0.1:${PORT}`);
});
