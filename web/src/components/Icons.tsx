// 统一的内联线性 SVG 图标集（stroke 1.6 / currentColor）。替换全站 emoji。
// 尺寸默认 18，由父级 CSS 规则（.btn svg / .nav-item svg 等）按需覆盖。
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconDocumentText(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </Base>
  );
}

export function IconSettings(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Base>
  );
}

// 品牌印章：墨色方框 + 抬头线 + 一点品牌蓝印（呼应强调色，公章意象）
export function IconBrandMark(p: IconProps) {
  return (
    <Base strokeLinecap="square" strokeLinejoin="miter" {...p}>
      <rect x="4" y="4" width="16" height="16" />
      <path d="M8 9h8M8 13h6" />
      <rect x="14.5" y="14.5" width="2.5" height="2.5" fill="var(--accent)" stroke="none" />
    </Base>
  );
}

export function IconUploadCloud(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M16 16l-4-4-4 4" />
      <path d="M12 12v9" />
      <path d="M20.4 18.6A5 5 0 0 0 18 9h-1.3A8 8 0 1 0 3 16.3" />
    </Base>
  );
}

// AI 生成动作（笔，刻意避开 sparkles）
export function IconPen(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </Base>
  );
}

export function IconDownload(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </Base>
  );
}

export function IconSave(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </Base>
  );
}

export function IconPlug(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M9 2v6M15 2v6" />
      <path d="M7 8h10v3a5 5 0 0 1-10 0z" />
      <path d="M12 16v6" />
    </Base>
  );
}

export function IconPlus(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}

export function IconWallet(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M20 7H5a2 2 0 0 1 0-4h12a2 2 0 0 1 2 2v2" />
      <path d="M4 7h16v12a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V5" />
      <path d="M16 13h4" />
    </Base>
  );
}

export function IconCornerDownRight(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M15 10l5 5-5 5" />
      <path d="M4 4v7a4 4 0 0 0 4 4h12" />
    </Base>
  );
}

export function IconTrash(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </Base>
  );
}

export function IconCheckCircle(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </Base>
  );
}

export function IconAlertTriangle(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M10.3 3.8 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </Base>
  );
}

export function IconCircle(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="8" />
    </Base>
  );
}

export function IconEye(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </Base>
  );
}

export function IconChevronRight(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M9 6l6 6-6 6" />
    </Base>
  );
}

export function IconThermometer(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z" />
    </Base>
  );
}
