/**
 * 音频工具函数
 *
 * 麦克风采集：Float32 PCM → Int16 PCM → base64（发送到后端）
 * 播放接收：base64 MP3 → Uint8Array（喂给 MediaSource）
 */

/** 将 AudioContext 输出的 Float32 采样转换为 Int16 PCM */
export function float32ToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** 将 ArrayBuffer 编码为 base64 字符串（分块处理避免栈溢出） */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}

/** 将 base64 字符串解码为 Uint8Array */
export function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
