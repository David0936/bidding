// 目录编辑器：递归渲染可编辑的章节树。支持改标题、加子节点、加同级、删除、分册标记。
import type { BidVolume, Outline, OutlineNode } from '../types';
import { IconCornerDownRight, IconTrash, IconPlus } from './Icons';

const VOLUME_LABELS: Record<BidVolume, string> = {
  technical: '技术标',
  business: '商务标',
  price: '价格标',
  other: '其他',
};

const PRICE_KEYWORDS = ['报价', '价格', '开标一览', '分项报价', '单价', '费用清单', '投标函附录'];
const BUSINESS_KEYWORDS = [
  '资质', '资格', '营业执照', '业绩', '财务', '信誉', '证书', '授权', '保证金',
  '商务', '资信', '法定代表人', '社保', '纳税', '声明', '承诺函', '投标函',
  '偏离表', '联合体', '廉洁', '保密协议',
];

/** 与服务端 volumeUtils 一致的标题关键词自动归类（未显式标记时的默认值） */
function classifyVolumeByTitle(title: string): BidVolume {
  if (PRICE_KEYWORDS.some((k) => title.includes(k))) return 'price';
  if (BUSINESS_KEYWORDS.some((k) => title.includes(k))) return 'business';
  return 'technical';
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ===== 不可变树操作（按 id） =====
function mapTree(nodes: OutlineNode[], fn: (n: OutlineNode) => OutlineNode): OutlineNode[] {
  return nodes.map((n) => fn({ ...n, children: mapTree(n.children, fn) }));
}

function updateTitle(nodes: OutlineNode[], id: string, title: string): OutlineNode[] {
  return mapTree(nodes, (n) => (n.id === id ? { ...n, title } : n));
}

function updateEstimatedWords(nodes: OutlineNode[], id: string, estimatedWords: number): OutlineNode[] {
  return mapTree(nodes, (n) => (n.id === id ? { ...n, estimatedWords } : n));
}

function updateVolume(nodes: OutlineNode[], id: string, volume: BidVolume | undefined): OutlineNode[] {
  return mapTree(nodes, (n) => (n.id === id ? { ...n, volume } : n));
}

function removeNode(nodes: OutlineNode[], id: string): OutlineNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNode(n.children, id) }));
}

function addChild(nodes: OutlineNode[], parentId: string): OutlineNode[] {
  return nodes.map((n) =>
    n.id === parentId
      ? { ...n, estimatedWords: undefined, children: [...n.children, { id: uid(), title: '新条目', children: [], estimatedWords: 2000 }] }
      : { ...n, children: addChild(n.children, parentId) },
  );
}

function sumEstimatedWords(nodes: OutlineNode[]): number {
  return nodes.reduce((sum, node) => {
    if (node.children.length === 0) return sum + Math.max(0, Number(node.estimatedWords ?? 0));
    return sum + sumEstimatedWords(node.children);
  }, 0);
}

function NodeRow({
  node,
  depth,
  onTitle,
  onAddChild,
  onRemove,
  onEstimatedWords,
  onVolume,
}: {
  node: OutlineNode;
  depth: number;
  onTitle: (id: string, t: string) => void;
  onAddChild: (id: string) => void;
  onRemove: (id: string) => void;
  onEstimatedWords: (id: string, words: number) => void;
  onVolume: (id: string, volume: BidVolume | undefined) => void;
}) {
  const isLeaf = node.children.length === 0;
  const autoVolume = classifyVolumeByTitle(node.title);
  return (
    <div className="outline-node" style={{ marginLeft: depth * 24 }}>
      <div className="outline-row">
        <span className="outline-dot" data-depth={depth} />
        <input
          className="outline-input"
          value={node.title}
          onChange={(e) => onTitle(node.id, e.target.value)}
        />
        {depth === 0 && (
          <label className="outline-volume" title="分册归属：导出时可按技术标/商务标/价格标拆分">
            <select
              value={node.volume ?? ''}
              onChange={(e) => onVolume(node.id, (e.target.value || undefined) as BidVolume | undefined)}
            >
              <option value="">自动（{VOLUME_LABELS[autoVolume]}）</option>
              <option value="technical">技术标</option>
              <option value="business">商务标</option>
              <option value="price">价格标</option>
              <option value="other">其他</option>
            </select>
          </label>
        )}
        {isLeaf && (
          <label className="outline-words">
            <span>预计字数</span>
            <input
              type="number"
              min={300}
              max={20000}
              step={100}
              value={node.estimatedWords ?? 2000}
              onChange={(e) => onEstimatedWords(node.id, Math.max(300, Number(e.target.value) || 300))}
            />
          </label>
        )}
        <div className="outline-actions">
          {depth < 3 && (
            <button
              className="mini-btn"
              title="添加子条目"
              aria-label="添加子条目"
              onClick={() => onAddChild(node.id)}
            >
              <IconCornerDownRight />
            </button>
          )}
          <button
            className="mini-btn danger"
            title="删除"
            aria-label="删除"
            onClick={() => onRemove(node.id)}
          >
            <IconTrash />
          </button>
        </div>
      </div>
      {node.children.map((c) => (
        <NodeRow
          key={c.id}
          node={c}
          depth={depth + 1}
          onTitle={onTitle}
          onAddChild={onAddChild}
          onRemove={onRemove}
          onEstimatedWords={onEstimatedWords}
          onVolume={onVolume}
        />
      ))}
    </div>
  );
}

export default function OutlineEditor({
  outline,
  onChange,
}: {
  outline: Outline;
  onChange: (o: Outline) => void;
}) {
  const setNodes = (nodes: OutlineNode[]) => onChange({ ...outline, nodes });
  const totalWords = sumEstimatedWords(outline.nodes);

  return (
    <div className="outline-editor">
      <div className="outline-editor-head">
        <div className="field" style={{ maxWidth: 420 }}>
          <label>文档标题</label>
          <input
            value={outline.title}
            onChange={(e) => onChange({ ...outline, title: e.target.value })}
          />
        </div>
        <div className="outline-total">
          <span>预计总字数</span>
          <strong>{totalWords.toLocaleString()} 字</strong>
        </div>
      </div>

      <div className="outline-tree">
        {outline.nodes.map((n) => (
          <NodeRow
            key={n.id}
            node={n}
            depth={0}
            onTitle={(id, t) => setNodes(updateTitle(outline.nodes, id, t))}
            onAddChild={(id) => setNodes(addChild(outline.nodes, id))}
            onRemove={(id) => setNodes(removeNode(outline.nodes, id))}
            onEstimatedWords={(id, words) => setNodes(updateEstimatedWords(outline.nodes, id, words))}
            onVolume={(id, volume) => setNodes(updateVolume(outline.nodes, id, volume))}
          />
        ))}
      </div>

      <button
        className="btn btn-ghost btn-sm"
        onClick={() =>
          setNodes([...outline.nodes, { id: uid(), title: '新章节', children: [], estimatedWords: 2000 }])
        }
      >
        <IconPlus />
        添加一级章节
      </button>
    </div>
  );
}
