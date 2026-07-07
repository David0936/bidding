// 确定性废标点校验：纯规则、不调 AI。当前覆盖三类高频形式审查废标项：
//   1. 金额小写与中文大写不一致（如 小写：1,234.50 元 / 大写：壹仟贰佰叁拾肆元伍角）
//   2. 全文多处「投标总报价」金额互不一致（开标一览表 vs 分项汇总）
//   3. 投标有效期/工期 与招标文件要求冲突（有效期短于要求、工期超出要求）
// 设计原则：提取有歧义时跳过而不误报——漏报可靠人工，误报会摧毁用户信任。
import type { Outline, OutlineNode } from '../outline/types.js';

export type DeterministicRule =
  | 'amount_case_mismatch'
  | 'amount_case_missing'
  | 'amount_cross_ref'
  | 'validity_conflict'
  | 'duration_conflict';

export interface DeterministicIssue {
  rule: DeterministicRule;
  severity: 'blocker' | 'warning';
  message: string;
}

const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const UNITS = ['', '拾', '佰', '仟'];
const GROUPS = ['', '万', '亿', '万亿'];

function fourDigitsToUpper(value: number): string {
  let out = '';
  let zeroPending = false;
  for (let i = 3; i >= 0; i--) {
    const digit = Math.floor(value / 10 ** i) % 10;
    if (digit === 0) {
      if (out) zeroPending = true;
    } else {
      if (zeroPending) {
        out += '零';
        zeroPending = false;
      }
      out += DIGITS[digit] + UNITS[i];
    }
  }
  return out;
}

/** 数字金额 → 中文大写（元角分/整），支持到千亿级 */
export function amountToChineseUpper(amount: number): string {
  if (!Number.isFinite(amount)) return '';
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const integer = Math.floor(abs + 1e-9);
  const cents = Math.round((abs - integer) * 100);
  const jiao = Math.floor(cents / 10);
  const fen = cents % 10;

  let intPart = '';
  if (integer === 0) {
    intPart = '零';
  } else {
    const groups: number[] = [];
    let rest = integer;
    while (rest > 0) {
      groups.push(rest % 10000);
      rest = Math.floor(rest / 10000);
    }
    for (let g = groups.length - 1; g >= 0; g--) {
      const value = groups[g];
      if (value === 0) continue;
      // 高位组之后、当前组不足四位（存在前导零）时补一个「零」
      if (intPart && value < 1000) intPart += '零';
      intPart += fourDigitsToUpper(value) + GROUPS[g];
    }
  }

  let out = `${intPart}元`;
  if (jiao === 0 && fen === 0) {
    out += '整';
  } else {
    if (jiao > 0) out += `${DIGITS[jiao]}角`;
    else if (fen > 0 && integer > 0) out += '零';
    if (fen > 0) out += `${DIGITS[fen]}分`;
  }
  return (negative ? '负' : '') + out;
}

/** 规整大写串用于比较：去币种前缀/空白，圆→元、正→整 */
function normalizeUpper(text: string): string {
  return text
    .replace(/人民币|￥|¥|RMB/gi, '')
    .replace(/\s+/g, '')
    .replace(/圆/g, '元')
    .replace(/正$/g, '整');
}

const UPPER_CHARS = /^[零壹贰叁肆伍陆柒捌玖拾佰仟万亿元角分整圆正]+$/;

function parseAmountNumber(raw: string, wan: boolean): number | null {
  const cleaned = raw.replace(/[,，\s]/g, '');
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return wan ? value * 10000 : value;
}

/** 收集大纲全部叶子正文（含标题路径，便于报错定位） */
function collectLeafTexts(nodes: OutlineNode[], parents: string[] = []): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const node of nodes) {
    const path = [...parents, node.title];
    if (node.children.length > 0) {
      out.push(...collectLeafTexts(node.children, path));
    } else if (node.content?.trim()) {
      out.push({ path: path.join(' / '), text: node.content });
    }
  }
  return out;
}

const LOWER_NEAR_UPPER_WINDOW = 300;
const LOWER_RE = /小写[：:]?\s*(?:人民币|￥|¥)?\s*([\d,，]+(?:\.\d{1,2})?)\s*(万)?元?/;
const UPPER_RE = /大写[：:]?\s*(?:人民币)?\s*([零壹贰叁肆伍陆柒捌玖拾佰仟万亿元角分整圆正\s]+)/;

/** 规则1：同一窗口内成对出现的小写/大写金额必须一致 */
function checkAmountCase(path: string, text: string, issues: DeterministicIssue[]): void {
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const rest = text.slice(searchFrom);
    const lower = rest.match(LOWER_RE);
    if (!lower || lower.index === undefined) break;
    const windowStart = lower.index;
    const window = rest.slice(windowStart, windowStart + LOWER_NEAR_UPPER_WINDOW);
    const upper = window.match(UPPER_RE);
    const amount = parseAmountNumber(lower[1], lower[2] === '万');

    if (amount !== null && upper) {
      const found = normalizeUpper(upper[1]);
      if (found && UPPER_CHARS.test(found)) {
        const expected = amountToChineseUpper(amount);
        if (found !== expected) {
          issues.push({
            rule: 'amount_case_mismatch',
            severity: 'blocker',
            message: `「${path}」中金额大小写不一致：小写 ${lower[1]}${lower[2] ?? ''}元 应为「${expected}」，正文写的是「${found}」。`,
          });
        }
      }
    } else if (amount !== null && !upper) {
      issues.push({
        rule: 'amount_case_missing',
        severity: 'warning',
        message: `「${path}」中出现小写金额 ${lower[1]}${lower[2] ?? ''}元，但附近未找到对应的中文大写金额，请核对报价表填写是否完整。`,
      });
    }
    searchFrom += windowStart + lower[0].length;
  }
}

const TOTAL_PRICE_RE = /(?:投标(?:总)?报价|总报价|报价合计|投标价格)[^\d零壹贰叁肆伍陆柒捌玖\n]{0,12}([\d,，]+(?:\.\d{1,2})?)\s*(万)?元/g;

/** 规则2：全文「投标总报价」类金额必须唯一 */
function checkCrossAmounts(leaves: { path: string; text: string }[], issues: DeterministicIssue[]): void {
  const found = new Map<number, string>();
  for (const leaf of leaves) {
    for (const match of leaf.text.matchAll(TOTAL_PRICE_RE)) {
      const amount = parseAmountNumber(match[1], match[2] === '万');
      if (amount === null) continue;
      if (!found.has(amount)) found.set(amount, leaf.path);
    }
  }
  if (found.size > 1) {
    const values = Array.from(found.entries())
      .map(([amount, path]) => `${amount.toLocaleString()} 元（${path}）`)
      .join('；');
    issues.push({
      rule: 'amount_cross_ref',
      severity: 'blocker',
      message: `全文出现 ${found.size} 个互不一致的投标总报价：${values}。开标一览表、投标函与分项汇总必须完全一致。`,
    });
  }
}

/** 从文本中提取唯一数值；出现多个不同值时返回 null（有歧义则跳过） */
function extractUniqueNumber(text: string, re: RegExp): number | null {
  const values = new Set<number>();
  for (const match of text.matchAll(re)) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) values.add(value);
  }
  return values.size === 1 ? Array.from(values)[0] : null;
}

const TENDER_VALIDITY_RE = /投标有效期[^\d\n]{0,15}(\d{1,4})\s*(?:个?日历天|天|日)/g;
const BID_VALIDITY_RE = /投标有效期[^\d\n]{0,15}(\d{1,4})\s*(?:个?日历天|天|日)/g;
const TENDER_DURATION_RE = /(?:工期|服务期限?|交货期)[^\d\n]{0,15}(\d{1,4})\s*(?:个?日历天|天|日)/g;
const BID_DURATION_RE = /(?:工期|服务期限?|交货期)[^\d\n]{0,15}(\d{1,4})\s*(?:个?日历天|天|日)/g;

/** 规则3：投标有效期不得短于招标要求；工期不得超过招标要求 */
function checkDurations(
  bidText: string,
  tenderText: string | null | undefined,
  issues: DeterministicIssue[],
): void {
  if (!tenderText) return;

  const tenderValidity = extractUniqueNumber(tenderText, TENDER_VALIDITY_RE);
  const bidValidity = extractUniqueNumber(bidText, BID_VALIDITY_RE);
  if (tenderValidity !== null && bidValidity !== null && bidValidity < tenderValidity) {
    issues.push({
      rule: 'validity_conflict',
      severity: 'blocker',
      message: `投标有效期 ${bidValidity} 天短于招标文件要求的 ${tenderValidity} 天，属于实质性偏差。`,
    });
  }

  const tenderDuration = extractUniqueNumber(tenderText, TENDER_DURATION_RE);
  const bidDuration = extractUniqueNumber(bidText, BID_DURATION_RE);
  if (tenderDuration !== null && bidDuration !== null && bidDuration > tenderDuration) {
    issues.push({
      rule: 'duration_conflict',
      severity: 'blocker',
      message: `承诺工期/服务期 ${bidDuration} 天超过招标文件规定的 ${tenderDuration} 天，属于实质性偏差。`,
    });
  }
}

export function runDeterministicChecks(
  outline: Outline | null,
  tenderText?: string | null,
): DeterministicIssue[] {
  if (!outline) return [];
  const issues: DeterministicIssue[] = [];
  const leaves = collectLeafTexts(outline.nodes);

  for (const leaf of leaves) {
    checkAmountCase(leaf.path, leaf.text, issues);
  }
  checkCrossAmounts(leaves, issues);
  checkDurations(leaves.map((leaf) => leaf.text).join('\n'), tenderText, issues);

  return issues;
}
