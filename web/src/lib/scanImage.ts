// 证照/照片「扫描增强」：在浏览器内用 canvas 做灰度 + 对比度拉伸 + 提亮，
// 让手机拍摄的营业执照、证书等看起来接近扫描件。处理后输出 JPEG File 再上传。

export interface ScanEnhanceOptions {
  /** 是否转灰度（黑白扫描效果），默认 true */
  grayscale?: boolean;
  /** 输出最长边像素，默认 2200（足够 A4 打印清晰度） */
  maxDimension?: number;
  /** 输出 JPEG 质量，默认 0.92 */
  quality?: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败'));
    };
    img.src = url;
  });
}

/** 对图片做扫描增强，返回处理后的新 File；处理失败时抛错，调用方可回退为原图上传 */
export async function enhanceScan(file: File, options: ScanEnhanceOptions = {}): Promise<File> {
  const grayscale = options.grayscale ?? true;
  const maxDimension = options.maxDimension ?? 2200;
  const quality = options.quality ?? 0.92;

  const img = await loadImage(file);
  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持图片处理');
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // 第一遍：统计亮度直方图，找 2%~98% 分位做对比度拉伸区间
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    histogram[lum]++;
  }
  const total = width * height;
  let low = 0;
  let high = 255;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += histogram[v];
    if (acc >= total * 0.02) {
      low = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += histogram[v];
    if (acc >= total * 0.02) {
      high = v;
      break;
    }
  }
  const range = Math.max(high - low, 1);

  // 第二遍：拉伸 + 轻微 gamma 提亮（文档底色更白，文字更黑）
  const gamma = 0.9;
  const lut = new Array<number>(256);
  for (let v = 0; v < 256; v++) {
    const stretched = Math.min(Math.max((v - low) / range, 0), 1);
    lut[v] = Math.round(Math.pow(stretched, gamma) * 255);
  }

  for (let i = 0; i < data.length; i += 4) {
    if (grayscale) {
      const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      const value = lut[lum];
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    } else {
      data[i] = lut[data[i]];
      data[i + 1] = lut[data[i + 1]];
      data[i + 2] = lut[data[i + 2]];
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('图片导出失败'))),
      'image/jpeg',
      quality,
    );
  });

  const baseName = file.name.replace(/\.(png|jpe?g)$/i, '');
  return new File([blob], `${baseName}-扫描件.jpg`, { type: 'image/jpeg' });
}
