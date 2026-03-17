/**
 * outbound-mock.ts — 外呼任务类型 & 运行时回访任务列表
 */

export type { CollectionCase, MarketingTask, CallbackTask } from './outbound-types';
import type { CallbackTask } from './outbound-types';

/** 运行时回访任务列表（内存中） */
export const CALLBACK_TASKS: CallbackTask[] = [];
