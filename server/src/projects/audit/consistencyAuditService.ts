import { jsonChat } from '../../ai/jsonChat.js';
import type { AIConfig } from '../../ai/types.js';
import type { GlobalFacts, TenderAnalysis } from '../analysis/types.js';
import { renderAnalysisForPrompt, renderFactsForPrompt } from '../analysis/analysisService.js';
import type { Outline } from '../outline/types.js';
import { collectLeaves, renderOutlineText } from '../outline/treeUtils.js';
import type { ConsistencyAudit, ConsistencyIssue } from './types.js';

const MAX_CONTENT_CHARS = 28000;

interface RawAudit {
  summary?: unknown;
  issues?: unknown;
}

function renderGeneratedContent(outline: Outline): string {
  const chunks: string[] = [];
  for (const leaf of collectLeaves(outline.nodes)) {
    const content = (leaf.node.content ?? '').trim();
    if (!content) continue;
    chunks.push(
      [
        `node_id: ${leaf.node.id}`,
        `path: ${leaf.path.join(' / ')}`,
        'content:',
        content,
      ].join('\n'),
    );
  }
  const full = chunks.join('\n\n---\n\n');
  if (full.length <= MAX_CONTENT_CHARS) return full;
  return `${full.slice(0, MAX_CONTENT_CHARS)}\n\n（注：正文较长，此处为前部内容节选；请只审计可见内容。）`;
}

function normalizeAudit(raw: RawAudit, outline: Outline): ConsistencyAudit {
  const validNodes = new Map(collectLeaves(outline.nodes).map((leaf) => [leaf.node.id, leaf.path]));
  const issues: ConsistencyIssue[] = [];

  if (Array.isArray(raw.issues)) {
    raw.issues.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const obj = item as Record<string, unknown>;
      const nodeId = String(obj.nodeId ?? obj.node_id ?? '').trim();
      const path = validNodes.get(nodeId);
      if (!nodeId || !path) return;
      const problem = String(obj.problem ?? '').trim();
      const suggestion = String(obj.suggestion ?? '').trim();
      if (!problem || !suggestion) return;
      const severityRaw = String(obj.severity ?? '').trim();
      const severity =
        severityRaw === 'high' || severityRaw === 'medium' || severityRaw === 'low'
          ? severityRaw
          : 'medium';
      issues.push({
        id: String(obj.id ?? '').trim() || `A${String(index + 1).padStart(3, '0')}`,
        nodeId,
        path,
        factId: String(obj.factId ?? obj.fact_id ?? '').trim() || undefined,
        factTitle: String(obj.factTitle ?? obj.fact_title ?? '').trim() || undefined,
        severity,
        problem,
        quote: String(obj.quote ?? '').trim() || undefined,
        suggestion,
      });
    });
  }

  return {
    summary:
      String(raw.summary ?? '').trim() ||
      (issues.length > 0 ? `发现 ${issues.length} 处可能的一致性问题。` : '未发现明显一致性问题。'),
    issues,
    checkedAt: new Date().toISOString(),
  };
}

export async function auditConsistency(
  config: AIConfig,
  outline: Outline,
  analysis: TenderAnalysis | null,
  facts: GlobalFacts | null,
): Promise<ConsistencyAudit> {
  if (!facts || facts.items.length === 0) {
    throw new Error('请先生成全局事实后再执行一致性审计。');
  }

  const generatedContent = renderGeneratedContent(outline);
  if (!generatedContent.trim()) {
    throw new Error('请先生成正文后再执行一致性审计。');
  }

  const raw = await jsonChat<RawAudit>(config, {
    system: [
      '你是一名投标文件全文一致性审计专家。',
      '你的任务是找出已生成正文与全局事实、关键解析项之间的冲突。',
      '只报告明确或高度疑似的冲突，不要泛泛提出优化建议。',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          '【目录】',
          renderOutlineText(outline),
          '',
          '【关键解析项】',
          renderAnalysisForPrompt(analysis),
          '',
          '【全局事实】',
          renderFactsForPrompt(facts),
          '',
          '【已生成正文】',
          generatedContent,
          '',
          '请输出 JSON：',
          '{',
          '  "summary": "审计摘要",',
          '  "issues": [',
          '    { "id": "A001", "nodeId": "目录叶子节点ID", "factId": "关联事实ID，可空", "factTitle": "关联事实标题，可空", "severity": "high|medium|low", "problem": "冲突说明", "quote": "正文中的问题片段", "suggestion": "具体修改建议" }',
          '  ]',
          '}',
          '',
          '要求：nodeId 必须来自正文块中的 node_id；如果没有问题，issues 返回空数组。',
        ].join('\n'),
      },
    ],
    temperature: 0.2,
    feature: 'project.consistencyAudit',
  });

  return normalizeAudit(raw, outline);
}
