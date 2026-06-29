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

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** 招标文件解析结果（未上传时为 null） */
  tender: TenderDoc | null;
}

/** 列表项（不含正文本文） */
export type ProjectSummary = Project;
