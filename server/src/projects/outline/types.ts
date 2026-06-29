// 标书目录（大纲）数据模型。树形结构，叶子节点用于承载 M4 生成的正文。

export interface OutlineNode {
  /** 稳定 ID（生成时分配） */
  id: string;
  /** 章节标题 */
  title: string;
  /** 子节点（一级->二级->三级） */
  children: OutlineNode[];
  /** 正文内容（仅叶子节点；M4 生成填充） */
  content?: string;
}

export interface Outline {
  /** 文档标题，如「投标技术方案」 */
  title: string;
  /** 顶层章节 */
  nodes: OutlineNode[];
  /** 最近生成/保存时间 */
  updatedAt: string;
}
