import { Router } from 'express';
import { getCurrentAccountId } from '../billing/requestContext.js';
import { AgentError, applyAgent, createAgentReferral, getAgentOverview } from '../agents/agentStore.js';
import { errorMessage, errorStatus } from './errors.js';

export const agentsRouter = Router();

agentsRouter.get('/overview', (_req, res) => {
  res.json(getAgentOverview(getCurrentAccountId()));
});

agentsRouter.post('/apply', (req, res) => {
  try {
    res.json(applyAgent(getCurrentAccountId(), req.body ?? {}));
  } catch (err) {
    res.status(err instanceof AgentError ? err.status : errorStatus(err)).json({
      message: errorMessage(err, '代理人申请失败'),
    });
  }
});

agentsRouter.post('/referrals', (req, res) => {
  try {
    res.json(createAgentReferral(getCurrentAccountId(), req.body ?? {}));
  } catch (err) {
    res.status(err instanceof AgentError ? err.status : errorStatus(err)).json({
      message: errorMessage(err, '线索登记失败'),
    });
  }
});
