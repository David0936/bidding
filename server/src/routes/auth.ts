import { Router } from 'express';
import {
  extractBearerToken,
  loginUser,
  logoutToken,
  registerUser,
  resolveToken,
} from '../auth/authStore.js';
import { ensureBillingAccount } from '../billing/billingStore.js';

export const authRouter = Router();

authRouter.get('/me', (req, res) => {
  const token = extractBearerToken(req.headers.authorization);
  const user = resolveToken(token);
  res.json({ authenticated: Boolean(user), user });
});

authRouter.post('/register', (req, res) => {
  const result = registerUser({
    email: req.body?.email,
    password: req.body?.password,
    displayName: req.body?.displayName,
  });
  ensureBillingAccount(result.user.accountId, result.user.displayName);
  res.json(result);
});

authRouter.post('/login', (req, res) => {
  const result = loginUser({ email: req.body?.email, password: req.body?.password });
  ensureBillingAccount(result.user.accountId, result.user.displayName);
  res.json(result);
});

authRouter.post('/logout', (req, res) => {
  logoutToken(extractBearerToken(req.headers.authorization));
  res.json({ ok: true });
});
