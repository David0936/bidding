import type { ResponseItemCategory, ResponseItemStatus, ResponseMatrix, ResponseMatrixItem } from '../responseMatrix/types.js';
import type { DeviationScope, DeviationTable, DeviationTableItem, DeviationType } from './types.js';

const TECHNICAL_CATEGORIES = new Set<ResponseItemCategory>(['technical', 'delivery', 'service']);

function scopeFromCategory(category: ResponseItemCategory): DeviationScope {
  return TECHNICAL_CATEGORIES.has(category) ? 'technical' : 'business';
}

function deviationTypeFromStatus(status: ResponseItemStatus): DeviationType {
  if (status === 'covered') return 'no_deviation';
  if (status === 'not_applicable') return 'not_applicable';
  return 'pending';
}

function descriptionFor(item: ResponseMatrixItem, deviationType: DeviationType): string {
  if (deviationType === 'no_deviation') return '完全响应招标文件要求，无偏离。';
  if (deviationType === 'not_applicable') return '该要求经判断不适用于当前投标文件，请在定稿前复核依据。';
  return item.gap || item.risk || '该项响应依据尚未闭合，定稿前需补正文、补表格或补附件，避免形成负偏离。';
}

function suggestionFor(item: ResponseMatrixItem, deviationType: DeviationType): string {
  if (deviationType === 'no_deviation') {
    return item.evidence
      ? `保持当前响应，并在偏离表中引用已覆盖证据：${item.evidence}`
      : '保持“无偏离”表述，定稿前复核正文中是否已有明确承诺。';
  }
  if (deviationType === 'not_applicable') return '如招标文件要求必须逐项列明，请在偏离表备注“不适用”并说明依据。';
  return item.suggestedSection
    ? `优先补充到“${item.suggestedSection}”，完成后刷新响应矩阵并将偏离类型调整为无偏离。`
    : '补充对应章节、附件或证明材料，完成后刷新响应矩阵并将偏离类型调整为无偏离。';
}

function responseFor(item: ResponseMatrixItem, deviationType: DeviationType): string {
  if (deviationType === 'no_deviation') return item.responseStrategy;
  if (deviationType === 'not_applicable') return '不适用，需结合招标文件条款复核。';
  return `拟响应：${item.responseStrategy}`;
}

function normalizeId(index: number): string {
  return `D${String(index + 1).padStart(3, '0')}`;
}

export function generateDeviationTableFromResponseMatrix(matrix: ResponseMatrix): DeviationTable {
  const sortedItems = matrix.items
    .slice()
    .sort((a, b) => {
      const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
      const statusRank = { missing: 0, risk: 1, partial: 2, covered: 3, not_applicable: 4 };
      return priorityRank[a.priority] - priorityRank[b.priority] || statusRank[a.status] - statusRank[b.status];
    });

  const items: DeviationTableItem[] = sortedItems.map((item, index) => {
    const deviationType = deviationTypeFromStatus(item.status);
    return {
      id: normalizeId(index),
      sourceResponseId: item.id,
      scope: scopeFromCategory(item.category),
      deviationType,
      priority: item.priority,
      sourceClause: item.sourceClause,
      requirement: item.requirement,
      response: responseFor(item, deviationType),
      deviationDescription: descriptionFor(item, deviationType),
      handlingSuggestion: suggestionFor(item, deviationType),
      suggestedSection: item.suggestedSection,
      risk: item.risk,
    };
  });

  const pendingCount = items.filter((item) => item.deviationType === 'pending').length;
  const noDeviationCount = items.filter((item) => item.deviationType === 'no_deviation').length;
  const notApplicableCount = items.filter((item) => item.deviationType === 'not_applicable').length;
  const now = new Date().toISOString();

  return {
    summary: `已生成 ${items.length} 条偏离表草稿：无偏离 ${noDeviationCount} 条，待确认 ${pendingCount} 条，不适用 ${notApplicableCount} 条。待确认项需补齐后再定稿。`,
    items,
    generatedAt: now,
    updatedAt: now,
  };
}
