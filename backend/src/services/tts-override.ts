/**
 * tts-override.ts — 非中文语音场景下，拦截 GLM 中文音频，按句翻译 + TTS 生成目标语言语音
 *
 * 从 outbound.ts / voice.ts 中提取的 100% 重复逻辑。
 */

import { translateText } from './translate-lang';
import { textToSpeech } from './tts';
import { logger } from './logger';

export interface TtsOverrideOpts {
  lang: 'zh' | 'en';
  sessionId: string;
  channel: string;
  ws: { send(data: string): void };
}

export class TtsOverride {
  /** 是否启用 TTS 覆盖（非中文时启用） */
  readonly active: boolean;

  private accum = '';
  private flushed = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(private opts: TtsOverrideOpts) {
    this.active = opts.lang !== 'zh';
  }

  /** 累积 delta 文本，遇到句号/问号/感叹号/分号/换行时刷出整句 */
  onDelta(delta: string): void {
    if (!delta) return;
    this.accum += delta;
    const pending = this.accum.slice(this.flushed);
    const re = /[。？！；\n]/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(pending)) !== null) {
      const end = this.flushed + match.index + match[0].length;
      const sentence = this.accum.slice(this.flushed, end).trim();
      if (sentence) this.sendSentence(sentence);
      this.flushed = end;
    }
  }

  /** 回合结束时，发送剩余未切分的尾部文本并重置状态 */
  flushRemainder(): void {
    const remainder = this.accum.slice(this.flushed).trim();
    if (remainder) this.sendSentence(remainder);
    this.accum = '';
    this.flushed = 0;
  }

  private sendSentence(sentence: string): void {
    const { ws, lang, sessionId, channel } = this.opts;
    this.queue = this.queue.then(async () => {
      try {
        const translated = await translateText(sentence, lang);
        const audio = await textToSpeech(translated, lang);
        logger.info(channel, 'tts_override_sentence', { session: sessionId, zhLen: sentence.length, enPreview: translated.slice(0, 60) });
        ws.send(JSON.stringify({ type: 'tts_override', text: translated, audio }));
      } catch (e) {
        logger.warn(channel, 'tts_override_error', { session: sessionId, error: String(e), sentence: sentence.slice(0, 40) });
        ws.send(JSON.stringify({ type: 'tts_override', text: sentence, audio: null }));
      }
    });
  }
}
