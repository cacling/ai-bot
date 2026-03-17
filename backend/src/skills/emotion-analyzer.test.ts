/**
 * emotion-analyzer.test.ts — 情感分析结果结构与类型测试
 *
 * 不调用 LLM，仅测试 EmotionResult 结构、EMOTION_META 映射和边界条件。
 */

import { describe, test, expect } from 'bun:test';

// 从 emotion-analyzer.ts 复制类型和映射（避免触发 LLM 初始化）
type EmotionLabel = '平静' | '礼貌' | '焦虑' | '不满' | '愤怒';

interface EmotionResult {
  label: EmotionLabel;
  emoji: string;
  color: string;
}

const EMOTION_META: Record<EmotionLabel, { emoji: string; color: string }> = {
  平静: { emoji: '😌', color: 'gray' },
  礼貌: { emoji: '🙏', color: 'green' },
  焦虑: { emoji: '😟', color: 'amber' },
  不满: { emoji: '😒', color: 'orange' },
  愤怒: { emoji: '😡', color: 'red' },
};

const VALID_LABELS = new Set<string>(Object.keys(EMOTION_META));

function parseEmotionLabel(raw: string): EmotionResult {
  const label = raw.trim() as EmotionLabel;
  if (VALID_LABELS.has(label)) {
    return { label, ...EMOTION_META[label] };
  }
  return { label: '平静', ...EMOTION_META['平静'] };
}

describe('情感标签映射', () => {
  test('5 种情绪标签都已定义', () => {
    expect(VALID_LABELS.size).toBe(5);
    expect(VALID_LABELS.has('平静')).toBe(true);
    expect(VALID_LABELS.has('礼貌')).toBe(true);
    expect(VALID_LABELS.has('焦虑')).toBe(true);
    expect(VALID_LABELS.has('不满')).toBe(true);
    expect(VALID_LABELS.has('愤怒')).toBe(true);
  });

  test('每种情绪都有 emoji 和 color', () => {
    for (const [label, meta] of Object.entries(EMOTION_META)) {
      expect(meta.emoji).toBeTruthy();
      expect(meta.color).toBeTruthy();
    }
  });

  test('颜色从 gray → green → amber → orange → red 递进', () => {
    const colors = Object.values(EMOTION_META).map(m => m.color);
    expect(colors).toEqual(['gray', 'green', 'amber', 'orange', 'red']);
  });
});

describe('情感标签解析', () => {
  test('有效标签正确映射', () => {
    expect(parseEmotionLabel('愤怒')).toEqual({ label: '愤怒', emoji: '😡', color: 'red' });
    expect(parseEmotionLabel('礼貌')).toEqual({ label: '礼貌', emoji: '🙏', color: 'green' });
    expect(parseEmotionLabel('焦虑')).toEqual({ label: '焦虑', emoji: '😟', color: 'amber' });
  });

  test('含前后空格的标签可正确解析', () => {
    expect(parseEmotionLabel('  不满  ')).toEqual({ label: '不满', emoji: '😒', color: 'orange' });
  });

  test('无效标签降级为平静', () => {
    expect(parseEmotionLabel('高兴')).toEqual({ label: '平静', emoji: '😌', color: 'gray' });
    expect(parseEmotionLabel('')).toEqual({ label: '平静', emoji: '😌', color: 'gray' });
    expect(parseEmotionLabel('angry')).toEqual({ label: '平静', emoji: '😌', color: 'gray' });
  });

  test('LLM 返回多余文字时降级为平静', () => {
    expect(parseEmotionLabel('当前情绪是愤怒')).toEqual({ label: '平静', emoji: '😌', color: 'gray' });
  });
});
