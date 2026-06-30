import { Router } from 'express';
import { createAdminToken, isAdminRequest } from '../admin/adminAuth.js';

export const adminRouter = Router();

adminRouter.post('/login', (req, res) => {
  const configured = process.env.EASY_BIDDING_ADMIN_SECRET || process.env.EASY_BIDDING_DEV_ADMIN_SECRET || '';
  if (!configured) {
    return res.status(500).json({ message: '未配置管理员密钥。' });
  }
  if (String(req.body?.secret ?? '') !== configured) {
    return res.status(401).json({ message: '管理员密钥不正确。' });
  }
  res.json({ token: createAdminToken(), expiresInSeconds: 12 * 60 * 60 });
});

adminRouter.get('/me', (req, res) => {
  res.json({ authenticated: isAdminRequest(req), role: isAdminRequest(req) ? 'admin' : null });
});
