/**
 * image-processor.ts — 大图处理模块
 *
 * 使用 sharp 实现：分析图片尺寸 → 裁白边 → 生成总览 → 按网格切片（带重叠）
 * 被 skill-creator.ts 的 parseFlowchartImage() 调用。
 */
import sharp from 'sharp';

// ── 类型定义 ────────────────────────────────────────────────────────────────

export type ImageStrategy = 'direct' | 'resize' | 'tile';

export interface ImageAnalysis {
  width: number;
  height: number;
  strategy: ImageStrategy;
  /** tile 策略下的行列数 */
  rows: number;
  cols: number;
  /** tile 策略下的总切片数 */
  tileCount: number;
}

export interface TileOptions {
  /** 每片最大边长（像素） */
  maxTileSide?: number;
  /** 重叠比例 0-1 */
  overlap?: number;
}

// ── 阈值常量 ────────────────────────────────────────────────────────────────

/** 小于此值直接送 vision model */
const DIRECT_THRESHOLD = 2048;
/** 小于此值 resize 后送 vision model */
const RESIZE_THRESHOLD = 4096;
/** 裁白边时的亮度阈值（0-255，越大越激进） */
const TRIM_THRESHOLD = 20;
/** 默认切片最大边长 */
const DEFAULT_MAX_TILE_SIDE = 2048;
/** 默认重叠比例 */
const DEFAULT_OVERLAP = 0.15;

// ── 分析图片 ────────────────────────────────────────────────────────────────

/**
 * 分析图片尺寸，决定处理策略
 */
export async function analyzeImage(buffer: Buffer): Promise<ImageAnalysis> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const maxSide = Math.max(width, height);

  if (maxSide <= DIRECT_THRESHOLD) {
    return { width, height, strategy: 'direct', rows: 1, cols: 1, tileCount: 1 };
  }

  if (maxSide <= RESIZE_THRESHOLD) {
    return { width, height, strategy: 'resize', rows: 1, cols: 1, tileCount: 1 };
  }

  // 大图：计算切片行列数
  const { rows, cols } = computeGrid(width, height);
  return { width, height, strategy: 'tile', rows, cols, tileCount: rows * cols };
}

/**
 * 根据宽高比计算切片网格
 */
function computeGrid(width: number, height: number): { rows: number; cols: number } {
  const ratio = width / height;

  if (ratio > 2) {
    // 非常宽的图：横向多切
    return { rows: 2, cols: 3 };
  }
  if (ratio < 0.5) {
    // 非常高的图：纵向多切
    return { rows: 3, cols: 2 };
  }
  if (ratio > 1.3) {
    // 偏宽
    return { rows: 2, cols: 3 };
  }
  if (ratio < 0.77) {
    // 偏高
    return { rows: 3, cols: 2 };
  }
  // 接近正方形
  return { rows: 2, cols: 2 };
}

// ── 裁白边 ──────────────────────────────────────────────────────────────────

/**
 * 裁掉图片四周的白色/浅色空白区域
 */
export async function trimWhitespace(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .trim({ threshold: TRIM_THRESHOLD })
    .toBuffer();
}

// ── 总览缩略图 ──────────────────────────────────────────────────────────────

/**
 * 生成总览缩略图，最长边不超过 maxSide
 */
export async function generateOverview(buffer: Buffer, maxSide = 1024): Promise<Buffer> {
  return sharp(buffer)
    .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

// ── resize ──────────────────────────────────────────────────────────────────

/**
 * resize 图片到指定最大边长
 */
export async function resizeImage(buffer: Buffer, maxSide = DIRECT_THRESHOLD): Promise<Buffer> {
  return sharp(buffer)
    .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
}

// ── 按网格切片（带重叠） ────────────────────────────────────────────────────

/**
 * 将图片按网格切成多个 tile，每个 tile 之间有重叠区域
 *
 * @returns Buffer 数组，按行优先顺序（左上→右下）
 */
export async function generateTiles(
  buffer: Buffer,
  rows: number,
  cols: number,
  opts: TileOptions = {},
): Promise<Buffer[]> {
  const maxTileSide = opts.maxTileSide ?? DEFAULT_MAX_TILE_SIDE;
  const overlap = opts.overlap ?? DEFAULT_OVERLAP;

  const metadata = await sharp(buffer).metadata();
  const imgWidth = metadata.width ?? 0;
  const imgHeight = metadata.height ?? 0;

  // 计算每片的基础尺寸（不含重叠）
  const baseTileWidth = Math.ceil(imgWidth / cols);
  const baseTileHeight = Math.ceil(imgHeight / rows);

  // 重叠像素
  const overlapX = Math.round(baseTileWidth * overlap);
  const overlapY = Math.round(baseTileHeight * overlap);

  const tiles: Buffer[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // 计算提取区域（含重叠）
      let left = Math.max(0, col * baseTileWidth - overlapX);
      let top = Math.max(0, row * baseTileHeight - overlapY);
      let right = Math.min(imgWidth, (col + 1) * baseTileWidth + overlapX);
      let bottom = Math.min(imgHeight, (row + 1) * baseTileHeight + overlapY);

      let tileWidth = right - left;
      let tileHeight = bottom - top;

      // 提取切片
      let tile = sharp(buffer)
        .extract({ left, top, width: tileWidth, height: tileHeight });

      // 如果切片仍然超大，resize
      if (Math.max(tileWidth, tileHeight) > maxTileSide) {
        tile = tile.resize(maxTileSide, maxTileSide, { fit: 'inside' });
      }

      tiles.push(await tile.jpeg({ quality: 90 }).toBuffer());
    }
  }

  return tiles;
}

// ── 工具函数 ────────────────────────────────────────────────────────────────

/**
 * Buffer → base64 data URL
 */
export function toDataUrl(buffer: Buffer, format: 'jpeg' | 'png' = 'jpeg'): string {
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/**
 * base64 data URL → Buffer
 */
export function fromDataUrl(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) throw new Error('Invalid data URL');
  return Buffer.from(match[1], 'base64');
}
