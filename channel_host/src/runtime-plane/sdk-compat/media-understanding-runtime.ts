/**
 * openclaw/plugin-sdk/media-understanding-runtime compatibility
 *
 * Media understanding — image/video/audio description and transcription.
 * Stubs that return placeholder results in compat mode.
 */

export interface RunMediaUnderstandingFileParams {
  filePath: string;
  model?: string;
  prompt?: string;
}

export interface RunMediaUnderstandingFileResult {
  text: string;
  model: string;
  tokensUsed?: number;
}

export async function describeImageFile(_path: string): Promise<string> {
  return '[media understanding not available in channel-host compat mode]';
}

export async function describeImageFileWithModel(_path: string, _model?: string): Promise<string> {
  return '[media understanding not available in channel-host compat mode]';
}

export async function describeVideoFile(_path: string): Promise<string> {
  return '[media understanding not available in channel-host compat mode]';
}

export async function runMediaUnderstandingFile(_params: RunMediaUnderstandingFileParams): Promise<RunMediaUnderstandingFileResult> {
  return { text: '[not available]', model: 'stub' };
}

export async function transcribeAudioFile(_path: string): Promise<string> {
  return '[audio transcription not available in channel-host compat mode]';
}
