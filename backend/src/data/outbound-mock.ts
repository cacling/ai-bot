/**
 * outbound-mock.ts — 外呼任务类型 & 运行时回访任务列表
 */

export type { CollectionCase, MarketingTask, CallbackTask } from '../types/outbound';
import type { CallbackTask } from '../types/outbound';

/** 运行时回访任务列表（内存中） */
export const CALLBACK_TASKS: CallbackTask[] = [];
