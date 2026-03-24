import { generateText } from 'ai';
import { chatModel } from './llm';
import type { WorkflowStep } from './skill-workflow-types';
import { logger } from '../services/logger';

export async function renderStep(
  step: WorkflowStep,
  context: {
    userMessage: string;
    history: Array<{ role: string; content: string }>;
    skillName: string;
    phone: string;
    subscriberName?: string;
    lang: 'zh' | 'en';
    toolFacts?: string;
    refContent?: string;
    sessionState: { skillName: string; versionNo: number; currentStepId: string; pendingConfirm: boolean; startedAt: string };
  },
): Promise<string> {
  const systemPrompt = buildStepPrompt(step, context);

  try {
    const result = await generateText({
      model: chatModel,
      system: systemPrompt,
      messages: [
        ...context.history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: context.userMessage },
      ],
      // NO tools — LLM can only generate text
    });

    logger.info('skill-step-renderer', 'rendered', {
      step: step.id, kind: step.kind, textLen: result.text.length,
    });

    return result.text;
  } catch (err) {
    logger.error('skill-step-renderer', 'render_error', { step: step.id, error: String(err) });
    return step.kind === 'confirm'
      ? '请问您是否确认执行该操作？（请回复"确认"或"取消"）'
      : '抱歉，系统处理中遇到问题，请稍后再试。';
  }
}

function buildStepPrompt(step: WorkflowStep, context: {
  skillName: string;
  phone: string;
  subscriberName?: string;
  lang: 'zh' | 'en';
  toolFacts?: string;
  refContent?: string;
  sessionState: { currentStepId: string; pendingConfirm: boolean };
}): string {
  const lines: string[] = [
    '你是电信客服"小通"。当前正在执行业务 SOP 流程。',
    `用户手机号：${context.phone}${context.subscriberName ? `，姓名：${context.subscriberName}` : ''}`,
    '',
    '## 当前步骤',
    `步骤名称：${step.label}`,
    `步骤类型：${step.kind}`,
    '',
    '## 要求',
    '- 只完成当前步骤的任务，不要跳到其他步骤',
    '- 不要调用任何工具（系统会自动处理工具调用）',
    '- 回复简洁、专业、友善',
  ];

  if (step.kind === 'message') {
    lines.push('- 根据当前步骤要求和已有数据，生成合适的回复');
  }

  if (step.kind === 'ref' && context.refContent) {
    lines.push('', '## 参考文档', context.refContent, '', '请基于以上参考文档向用户解释相关信息。');
  }

  if (step.kind === 'confirm') {
    lines.push(
      '',
      '## 确认操作',
      '你的任务是：向用户说明将要执行的操作及其影响，然后询问是否确认。',
      '用户确认后系统会自动执行操作，你不需要调用任何工具。',
      '请确保用户理解操作后果后再请求确认。',
    );
  }

  if (context.toolFacts) {
    lines.push('', '## 已获取的数据', context.toolFacts);
  }

  return lines.join('\n');
}
