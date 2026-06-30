// 标书项目数据模型。一个项目 = 一份正在制作的投标文件。

export type TenderFileType = 'pdf' | 'docx' | 'txt' | 'md';

export interface TenderDoc {
  /** 原始文件名 */
  fileName: string;
  /** 文件类型 */
  fileType: TenderFileType;
  /** 解析出的 Markdown 工作稿字符数 */
  charCount: number;
  /** Markdown 工作稿相对路径 */
  markdownPath?: string;
  /** 原始完整 Markdown 相对路径（当前投标范围裁剪前） */
  originalMarkdownPath?: string;
  /** 上传时间 */
  uploadedAt: string;
}

export type BidSectionMode = 'single' | 'multiple';

export interface BidSection {
  id: string;
  /** 标段/分包标题，例如“标段一：储能系统采购” */
  title: string;
  /** 标段编号或序号 */
  code?: string;
  /** 在原始 Markdown 中的起始行，从 1 开始 */
  startLine: number;
  /** 在原始 Markdown 中的结束行，从 1 开始 */
  endLine: number;
  /** 标题后的简短描述 */
  summary?: string;
}

export interface ElectronicSeal {
  /** 原始印章图片名 */
  fileName: string;
  /** 图片 MIME 类型，目前导出支持 PNG/JPEG */
  mimeType: string;
  /** 图片字节数 */
  size: number;
  /** 上传时间 */
  uploadedAt: string;
}

export interface SealPlacement {
  id: string;
  /** PDF 页码，从 1 开始 */
  page: number;
  /** 相对于页面宽度的左上角 X 坐标，0-1 */
  xRatio: number;
  /** 相对于页面高度的左上角 Y 坐标，0-1 */
  yRatio: number;
  /** 相对于页面宽度的印章宽度，0-1 */
  widthRatio: number;
  /** 透明度，0-1 */
  opacity: number;
  /** 旋转角度 */
  rotation: number;
}

export interface Project {
  id: string;
  /** 客户账户 ID，用于 SaaS 多客户数据隔离 */
  accountId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** 招标文件解析结果（未上传时为 null） */
  tender: TenderDoc | null;
  /** 招标文件是否识别出多标段/分包 */
  bidSectionMode: BidSectionMode;
  /** 从原始招标文件中识别出的标段/分包列表 */
  bidSections: BidSection[];
  /** 当前选择的投标范围；null 表示使用全文 */
  selectedBidSectionId: string | null;
  selectedBidSectionTitle: string | null;
  /** 已有技术方案解析结果（用于扩写模式；未上传时为 null） */
  originalPlan: TenderDoc | null;
  /** 电子印章图片元数据（未上传时为 null） */
  seal: ElectronicSeal | null;
}

/** 列表项（不含正文本文） */
export type ProjectSummary = Project;
