import type { ConsistencyAudit } from '../audit/types.js';
import { runDeterministicChecks } from '../checks/deterministicChecks.js';
import type { TenderIndustryProfile } from '../industryProfile/types.js';
import type { ProjectMaterialChecklist } from '../materialChecklist/types.js';
import type { Outline } from '../outline/types.js';
import { countGenerated } from '../outline/treeUtils.js';
import type { ResponseItemPriority, ResponseItemStatus, ResponseMatrix } from '../responseMatrix/types.js';
import type { SealPlacement } from '../types.js';
import type {
  BidReadinessIssue,
  BidReadinessLevel,
  BidReadinessReport,
  BidReadinessSeverity,
} from './types.js';

interface BuildReadinessInput {
  outline: Outline | null;
  industryProfile: TenderIndustryProfile | null;
  responseMatrix: ResponseMatrix | null;
  materialChecklist: ProjectMaterialChecklist | null;
  audit: ConsistencyAudit | null;
  sealPlacements: SealPlacement[];
  /** 招标文件工作稿全文，用于工期/有效期等确定性规则比对；可空 */
  tenderText?: string | null;
}

const STATUS_OPEN = new Set<ResponseItemStatus>(['missing', 'partial', 'risk']);
const PRIORITY_WEIGHT: Record<ResponseItemPriority, number> = {
  critical: 8,
  high: 4,
  medium: 2,
  low: 1,
};
const SEVERITY_RANK: Record<BidReadinessSeverity, number> = {
  blocker: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function clampScore(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function issue(
  id: string,
  severity: BidReadinessSeverity,
  title: string,
  detail: string,
  action: string,
  category: BidReadinessIssue['category'],
  source?: string,
): BidReadinessIssue {
  return { id, severity, title, detail, action, category, source };
}

function scorePenalty(issues: BidReadinessIssue[]): number {
  return issues.reduce((sum, item) => {
    if (item.severity === 'blocker') return sum + 18;
    if (item.severity === 'high') return sum + 10;
    if (item.severity === 'medium') return sum + 5;
    return sum + 2;
  }, 0);
}

function readinessLevel(score: number, issues: BidReadinessIssue[]): BidReadinessLevel {
  if (issues.some((item) => item.severity === 'blocker') || score < 60) return 'blocked';
  if (issues.some((item) => item.severity === 'high') || score < 85) return 'attention';
  return 'ready';
}

function readinessSummary(level: BidReadinessLevel, score: number, issues: BidReadinessIssue[]): string {
  const blockerCount = issues.filter((item) => item.severity === 'blocker').length;
  const highCount = issues.filter((item) => item.severity === 'high').length;
  if (level === 'ready') return `提交前总检 ${score} 分，关键响应、正文、资料和一致性检查整体可提交。`;
  if (level === 'blocked') {
    return `提交前总检 ${score} 分，仍有 ${blockerCount} 项阻断问题和 ${highCount} 项高风险问题，建议补齐后再定稿。`;
  }
  return `提交前总检 ${score} 分，有 ${highCount} 项高风险问题需要复核，补齐后可进入导出定稿。`;
}

export function buildBidReadinessReport(input: BuildReadinessInput): BidReadinessReport {
  const issues: BidReadinessIssue[] = [];
  const generated = input.outline ? countGenerated(input.outline) : { total: 0, done: 0 };

  if (!input.industryProfile) {
    issues.push(
      issue(
        'workflow-industry',
        'medium',
        '尚未生成行业/采购类型画像',
        '后续矩阵、资料清单和正文缺少行业口径，容易遗漏行业特有资料或风险。',
        '先在工作台运行“行业识别”，再刷新响应矩阵和资料清单。',
        'workflow',
      ),
    );
  }

  if (!input.outline || generated.total === 0) {
    issues.push(
      issue(
        'content-outline',
        'blocker',
        '尚未形成可提交目录',
        '没有结构化目录和叶子章节，无法判断正文完整性，也无法生成可交付文件。',
        '先生成并确认目录，再逐章节生成正文。',
        'content',
      ),
    );
  } else if (generated.done < generated.total) {
    const missing = generated.total - generated.done;
    issues.push(
      issue(
        'content-missing',
        missing === generated.total ? 'blocker' : 'high',
        '正文尚未全部生成',
        `当前正文完成 ${generated.done}/${generated.total} 个末级章节，仍有 ${missing} 个章节为空。`,
        '继续生成正文，或手动补齐空白章节后保存。',
        'content',
      ),
    );
  }

  const responseItems = input.responseMatrix?.items ?? [];
  const openResponses = responseItems.filter((item) => STATUS_OPEN.has(item.status));
  const criticalOpen = openResponses.filter((item) => item.priority === 'critical');
  const highOpen = openResponses.filter((item) => item.priority === 'high');

  if (responseItems.length === 0) {
    issues.push(
      issue(
        'response-missing',
        'blocker',
        '尚未生成点对点响应矩阵',
        '无法确认废标项、评分点、商务技术条款是否逐项覆盖。',
        '先生成响应矩阵，并优先处理 critical/high 且 missing/risk/partial 的要求项。',
        'response',
      ),
    );
  } else {
    for (const item of criticalOpen.slice(0, 8)) {
      issues.push(
        issue(
          `response-${item.id}`,
          'blocker',
          `关键响应项未闭合：${item.requirement}`,
          item.gap || item.risk || item.responseStrategy,
          '按响应策略补正文、补表格或补附件，并重新刷新响应矩阵。',
          'response',
          item.sourceClause,
        ),
      );
    }
    for (const item of highOpen.slice(0, Math.max(0, 10 - criticalOpen.length))) {
      issues.push(
        issue(
          `response-${item.id}`,
          'high',
          `高优先级响应项需复核：${item.requirement}`,
          item.gap || item.risk || item.responseStrategy,
          '按建议落点补充投标文件内容，并检查是否影响评分或实质性响应。',
          'response',
          item.sourceClause,
        ),
      );
    }
  }

  const checklistItems = input.materialChecklist?.items ?? [];
  const requiredMaterials = checklistItems.filter((item) => item.required);
  const missingRequired = requiredMaterials.filter((item) => item.files.length === 0 && item.status !== 'uploaded');

  if (checklistItems.length === 0) {
    issues.push(
      issue(
        'materials-missing',
        'high',
        '尚未梳理客户补充资料',
        '客户需上传的资质、业绩、报价、授权、技术参数等材料尚未形成清单。',
        '先生成资料补齐清单，再按项上传必需材料。',
        'materials',
      ),
    );
  } else if (missingRequired.length > 0) {
    for (const item of missingRequired.slice(0, 10)) {
      issues.push(
        issue(
          `material-${item.id}`,
          'high',
          `必需资料未上传：${item.title}`,
          item.description || item.purpose,
          item.uploadTips || '让客户按该资料项上传 PDF、Word、txt 或 md 文件。',
          'materials',
          item.sourceClause,
        ),
      );
    }
  }

  if (!input.audit) {
    issues.push(
      issue(
        'consistency-not-run',
        generated.total > 0 && generated.done >= generated.total ? 'medium' : 'low',
        '尚未执行全文一致性审计',
        '项目名称、工期、地点、金额、服务承诺等跨章节事实可能存在不一致。',
        '正文生成完成后运行“全文一致性审计”，再重新运行提交前总检。',
        'consistency',
      ),
    );
  } else {
    const highIssues = input.audit.issues.filter((item) => item.severity === 'high');
    for (const item of highIssues.slice(0, 8)) {
      issues.push(
        issue(
          `consistency-${item.id}`,
          'high',
          `一致性高风险：${item.path.join(' / ')}`,
          item.problem,
          item.suggestion,
          'consistency',
          item.factTitle,
        ),
      );
    }
  }

  // 确定性废标点校验：金额大小写、跨表总价、工期/有效期（纯规则，不依赖 AI）
  const deterministic = runDeterministicChecks(input.outline, input.tenderText);
  deterministic.forEach((item, index) => {
    issues.push(
      issue(
        `det-${item.rule}-${index + 1}`,
        item.severity === 'blocker' ? 'blocker' : 'medium',
        item.rule.startsWith('amount') ? '金额一致性问题' : '工期/有效期响应问题',
        item.message,
        '按招标文件要求修正正文对应位置后重新运行总检。',
        'consistency',
      ),
    );
  });

  if (input.sealPlacements.length === 0) {
    issues.push(
      issue(
        'seal-not-placed',
        'low',
        '尚未配置电子盖章位置',
        '如果本项目需要电子章版 PDF，还没有保存任何盖章坐标。',
        '上传电子章并在页面任意位置放置后保存坐标；如线下盖章可忽略。',
        'seal',
      ),
    );
  }

  const openResponsePenalty = Math.min(
    openResponses.reduce((sum, item) => sum + PRIORITY_WEIGHT[item.priority], 0),
    30,
  );
  const missingMaterialPenalty = Math.min(missingRequired.length * 5, 25);
  const contentPenalty =
    generated.total === 0 ? 25 : Math.min(((generated.total - generated.done) / generated.total) * 30, 30);
  const basePenalty = scorePenalty(issues) + openResponsePenalty + missingMaterialPenalty + contentPenalty;
  const score = clampScore(100 - basePenalty);
  const sortedIssues = issues.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const level = readinessLevel(score, sortedIssues);

  return {
    level,
    score,
    summary: readinessSummary(level, score, sortedIssues),
    metrics: {
      score,
      responseTotal: responseItems.length,
      responseOpen: openResponses.length,
      responseCriticalOpen: criticalOpen.length,
      requiredMaterials: requiredMaterials.length,
      uploadedRequiredMaterials: requiredMaterials.length - missingRequired.length,
      contentSections: generated.total,
      generatedContentSections: generated.done,
      consistencyIssues: input.audit?.issues.length ?? 0,
      highConsistencyIssues: input.audit?.issues.filter((item) => item.severity === 'high').length ?? 0,
      sealPlacements: input.sealPlacements.length,
    },
    issues: sortedIssues.slice(0, 60),
    generatedAt: new Date().toISOString(),
  };
}
