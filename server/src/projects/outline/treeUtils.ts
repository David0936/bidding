// 目录树通用工具：收集叶子、定位路径、渲染为上下文文本、更新节点正文。
import type { Outline, OutlineNode } from './types.js';

export interface LeafInfo {
  node: OutlineNode;
  /** 从顶层到该节点的标题路径 */
  path: string[];
}

/** 收集所有叶子节点（无子节点者）。叶子才承载正文。 */
export function collectLeaves(nodes: OutlineNode[], parents: string[] = []): LeafInfo[] {
  const result: LeafInfo[] = [];
  for (const n of nodes) {
    const path = [...parents, n.title];
    if (n.children.length === 0) {
      result.push({ node: n, path });
    } else {
      result.push(...collectLeaves(n.children, path));
    }
  }
  return result;
}

/** 查找节点及其路径 */
export function findNode(nodes: OutlineNode[], id: string, parents: string[] = []): LeafInfo | null {
  for (const n of nodes) {
    const path = [...parents, n.title];
    if (n.id === id) return { node: n, path };
    const found = findNode(n.children, id, path);
    if (found) return found;
  }
  return null;
}

/** 把目录渲染为带缩进的纯文本，供模型理解整体结构 */
export function renderOutlineText(outline: Outline): string {
  const lines: string[] = [outline.title];
  const walk = (nodes: OutlineNode[], depth: number) => {
    for (const n of nodes) {
      const words = n.estimatedWords ? `（约 ${n.estimatedWords} 字）` : '';
      lines.push('  '.repeat(depth) + '- ' + n.title + words);
      walk(n.children, depth + 1);
    }
  };
  walk(outline.nodes, 1);
  return lines.join('\n');
}

/** 返回更新了某叶子正文后的新目录（不可变） */
export function setNodeContent(nodes: OutlineNode[], id: string, content: string): OutlineNode[] {
  return nodes.map((n) =>
    n.id === id
      ? { ...n, content, children: setNodeContent(n.children, id, content) }
      : { ...n, children: setNodeContent(n.children, id, content) },
  );
}

/** 已生成正文的叶子数量 */
export function countGenerated(outline: Outline): { total: number; done: number } {
  const leaves = collectLeaves(outline.nodes);
  const done = leaves.filter((l) => (l.node.content ?? '').trim().length > 0).length;
  return { total: leaves.length, done };
}
