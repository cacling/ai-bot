import { tool } from 'ai';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';
import { logger } from '../logger';

// Resolve biz-skills directory (src/agent/ → ../../skills/biz-skills → backend/skills/biz-skills/)
const SKILLS_DIR = resolve(
  process.env.SKILLS_DIR
    ? resolve(process.cwd(), process.env.SKILLS_DIR, 'biz-skills')
    : resolve(import.meta.dir, '../..', 'skills', 'biz-skills')
);

export const skillsTools = {
  get_skill_instructions: tool({
    description:
      '加载指定 Skill 的操作指南（SKILL.md）。当客户问题属于特定领域时，先调用此工具了解处理流程。' +
      '可用 skill_name: bill-inquiry（账单/费用/发票）, service-cancel（退订增值业务）, plan-inquiry（套餐咨询/推荐）, fault-diagnosis（网络故障/无信号/网速慢）, telecom-app（营业厅App所有问题：登录/闪退/功能异常/安装更新/账号安全）, outbound-collection（外呼催收：身份核验/逾期告知/还款意向收集/结果记录）, outbound-marketing（外呼营销：套餐推介/异议处理/转化跟进）, outbound-marketing-bank（银行外呼营销：贷款/理财/信用卡推介/免打扰登记/预约回访）',
    parameters: z.object({
      skill_name: z
        .enum(['bill-inquiry', 'service-cancel', 'plan-inquiry', 'fault-diagnosis', 'telecom-app', 'outbound-collection', 'outbound-marketing', 'outbound-marketing-bank'])
        .describe('Skill 名称'),
    }),
    execute: async ({ skill_name }) => {
      const t0 = performance.now();
      const path = `${SKILLS_DIR}/${skill_name}/SKILL.md`;
      try {
        const content = readFileSync(path, 'utf-8');
        logger.info('skills', 'get_instructions', { skill: skill_name, ms: Math.round(performance.now() - t0) });
        return content;
      } catch {
        logger.warn('skills', 'get_instructions_error', { skill: skill_name, path });
        return `Error: Skill "${skill_name}" not found at ${path}`;
      }
    },
  }),

  transfer_to_human: tool({
    description: '转接人工客服。当用户明确要求人工、问题超出自动化处理范围、或满足升级条件时调用。',
    parameters: z.object({
      current_intent: z.string().describe('用户当前诉求（一句话描述）'),
      recommended_action: z.string().describe('给人工坐席的处理建议'),
    }),
    execute: async ({ current_intent, recommended_action }) => {
      logger.info('skills', 'transfer_to_human', { intent: current_intent, action: recommended_action });
      return JSON.stringify({
        success: true,
        transfer_id: `TF${Date.now()}`,
        estimated_wait_seconds: 30,
        message: '转接请求已提交，请告知用户稍候',
      });
    },
  }),

  get_skill_reference: tool({
    description: '加载 Skill 的参考文档（如计费规则、套餐详情、退订政策、故障排查手册）',
    parameters: z.object({
      skill_name: z
        .enum(['bill-inquiry', 'service-cancel', 'plan-inquiry', 'fault-diagnosis', 'telecom-app', 'outbound-collection', 'outbound-marketing'])
        .describe('Skill 名称'),
      reference_path: z
        .string()
        .describe('参考文档文件名，如 "refund-policy.md" 或 "feature-comparison.md"'),
    }),
    execute: async ({ skill_name, reference_path }) => {
      const t0 = performance.now();
      const path = `${SKILLS_DIR}/${skill_name}/references/${reference_path}`;
      try {
        const content = readFileSync(path, 'utf-8');
        logger.info('skills', 'get_reference', { skill: skill_name, ref: reference_path, ms: Math.round(performance.now() - t0) });
        return content;
      } catch {
        logger.warn('skills', 'get_reference_error', { skill: skill_name, ref: reference_path, path });
        return `Error: Reference "${reference_path}" not found in skill "${skill_name}"`;
      }
    },
  }),
};
