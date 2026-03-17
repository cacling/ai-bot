/**
 * tts.ts — Text-to-speech via SiliconFlow /v1/audio/speech (OpenAI-compatible)
 */

const BASE_URL = process.env.SILICONFLOW_BASE_URL ?? 'https://api.siliconflow.cn/v1';
const API_KEY  = process.env.SILICONFLOW_API_KEY ?? '';
const MODEL    = process.env.TTS_MODEL ?? 'FunAudioLLM/CosyVoice2-0.5B';

const VOICE: Record<'zh' | 'en', string> = {
  zh: process.env.TTS_VOICE_ZH ?? 'FunAudioLLM/CosyVoice2-0.5B:anna',
  en: process.env.TTS_VOICE_EN ?? 'FunAudioLLM/CosyVoice2-0.5B:anna',
};

/**
 * Convert text to MP3 audio and return as a base64 string.
 */
export async function textToSpeech(text: string, lang: 'zh' | 'en' = 'zh'): Promise<string> {
  const res = await fetch(`${BASE_URL}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: text,
      voice: VOICE[lang],
      response_format: 'mp3',
      speed: 1.0,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const buf = await res.arrayBuffer();
  return Buffer.from(buf).toString('base64');
}
