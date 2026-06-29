// 标书项目数据模型。一个项目 = 一份正在制作的投标文件。

export type TenderFileType = 'pdf' | 'docx' | 'txt';

export interface TenderDoc {
  /** 原始文件名 */
  fileName: string;
  /** 文件类型 */
  fileType: TenderFileType;
  /** 解析出的纯文本字符数 */
  charCount: number;
  /** 上传时间 */
  uploadedAt: string;
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
  /** 已有技术方案解析结果（用于扩写模式；未上传时为 null） */
  originalPlan: TenderDoc | null;
  /** 电子印章图片元数据（未上传时为 null） */
  seal: ElectronicSeal | null;
}

/** 列表项（不含正文本文） */
export type ProjectSummary = Project;
