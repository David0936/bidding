// 投标主体档案接口：客户账户级资料，跨项目复用。
import { Router } from 'express';
import { getCurrentAccountId } from '../billing/requestContext.js';
import { getBidderProfile, saveBidderProfile } from '../bidder/bidderProfileStore.js';
import { errorMessage, errorStatus } from './errors.js';

export const bidderProfileRouter = Router();

bidderProfileRouter.get('/', (_req, res) => {
  res.json(getBidderProfile(getCurrentAccountId()));
});

bidderProfileRouter.put('/', (req, res) => {
  try {
    res.json(saveBidderProfile(getCurrentAccountId(), req.body ?? {}));
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, '投标主体档案保存失败') });
  }
});
