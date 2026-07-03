// 前端目录树工具：收集叶子、写入正文（不可变）。
import type { Outline, OutlineNode } from '../types';

export interface LeafInfo {
  node: OutlineNode;
  path: string[];
}

export function collectLeaves(nodes: OutlineNode[], parents: string[] = []): LeafInfo[] {
  const out: LeafInfo[] = [];
  for (const n of nodes) {
    const path = [...parents, n.title];
    if (n.children.length === 0) out.push({ node: n, path });
    else out.push(...collectLeaves(n.children, path));
  }
  return out;
}

export function setNodeContent(nodes: OutlineNode[], id: string, content: string): OutlineNode[] {
  return nodes.map((n) =>
    n.id === id
      ? { ...n, content, children: setNodeContent(n.children, id, content) }
      : { ...n, children: setNodeContent(n.children, id, content) },
  );
}

export function countGenerated(outline: Outline): { total: number; done: number } {
  const leaves = collectLeaves(outline.nodes);
  return {
    total: leaves.length,
    done: leaves.filter((l) => (l.node.content ?? '').trim().length > 0).length,
  };
}

export function sumEstimatedWords(outline: Outline): number {
  return collectLeaves(outline.nodes).reduce((sum, leaf) => sum + Math.max(0, Number(leaf.node.estimatedWords ?? 0)), 0);
}
