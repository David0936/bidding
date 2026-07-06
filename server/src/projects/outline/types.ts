// 标书目录（大纲）数据模型。树形结构，叶子节点用于承载 M4 生成的正文。

import type { BidVolume } from '../types.js';

export interface OutlineNode {
  /** 稳定 ID（生成时分配） */
  id: string;
  /** 章节标题 */
  title: string;
  /** 子节点（一级->二级->三级） */
  children: OutlineNode[];
  /** 正文内容（仅叶子节点；M4 生成填充） */
  content?: string;
  /** 叶子章节预计生成字数，用于控制正文篇幅 */
  estimatedWords?: number;
  /** 分册归属（技术标/商务标/价格标）；未标记时按标题关键词自动判定 */
  volume?: BidVolume;
}

export interface Outline {
  /** 文档标题，如「投标技术方案」 */
  title: string;
  /** 顶层章节 */
  nodes: OutlineNode[];
  /** 最近生成/保存时间 */
  updatedAt: string;
}

export interface OutlineVariant {
  id: string;
  name: string;
  summary: string;
  outline: Outline;
}

export interface OutlineVariantsResult {
  variants: OutlineVariant[];
  generatedAt: string;
}
