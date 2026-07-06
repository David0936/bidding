// 读取 PNG / JPEG 图片像素尺寸（docx 嵌图需要显式宽高）。

export interface ImageDimensions {
  width: number;
  height: number;
}

function pngSize(buffer: Buffer): ImageDimensions | null {
  // PNG 签名 8 字节 + IHDR 块：长度(4) + "IHDR"(4) + 宽(4) + 高(4)
  if (buffer.length < 24) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null;
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegSize(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buffer[offset + 1];
    // SOF0-SOF15（不含 DHT/DAC/RST 等非帧标记）
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

export function readImageSize(buffer: Buffer, mimeType: string): ImageDimensions | null {
  if (mimeType.includes('png')) return pngSize(buffer);
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return jpegSize(buffer);
  return pngSize(buffer) ?? jpegSize(buffer);
}
