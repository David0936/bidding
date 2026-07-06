// 分册（技术标/商务标/价格标）工具：章节归属判定与目录裁剪。
// 未显式标记 volume 的章节按标题关键词自动归类，客户可在目录编辑器中手动覆盖。
import type { BidVolume } from '../types.js';
import type { Outline, OutlineNode } from '../outline/types.js';

export const VOLUME_LABELS: Record<BidVolume, string> = {
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

/** 按标题关键词自动判定分册归属（未显式标记时使用） */
export function classifyVolumeByTitle(title: string): BidVolume {
  if (PRICE_KEYWORDS.some((k) => title.includes(k))) return 'price';
  if (BUSINESS_KEYWORDS.some((k) => title.includes(k))) return 'business';
  return 'technical';
}

/** 节点生效分册：显式标记 > 继承上级 > 标题关键词 */
export function effectiveVolume(node: OutlineNode, inherited: BidVolume | null): BidVolume {
  if (node.volume) return node.volume;
  if (inherited) return inherited;
  return classifyVolumeByTitle(node.title);
}

function filterNodes(nodes: OutlineNode[], volume: BidVolume, inherited: BidVolume | null): OutlineNode[] {
  const out: OutlineNode[] = [];
  for (const node of nodes) {
    const own = node.volume ?? inherited ?? classifyVolumeByTitle(node.title);
    const children = filterNodes(node.children, volume, own);
    if (own === volume || children.length > 0) {
      out.push({
        ...node,
        children: node.children.length > 0 ? children : node.children,
      });
    }
  }
  return out;
}

export function isBidVolume(value: unknown): value is BidVolume {
  return value === 'technical' || value === 'business' || value === 'price' || value === 'other';
}

/** 按分册裁剪目录；保留匹配节点及其必要的父级 */
export function filterOutlineByVolume(outline: Outline, volume: BidVolume): Outline {
  return {
    ...outline,
    title: `${outline.title || '投标文件'}（${VOLUME_LABELS[volume]}）`,
    nodes: filterNodes(outline.nodes, volume, null),
  };
}
