/**
 * testcase-runner.ts — 版本绑定测试用例执行器
 *
 * 支持单条和全量执行，使用 runTestMessage 驱动 Agent，
 * 用共享断言引擎评估结果。
 */

import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { runTestMessage, type TestMessageResult } from './skill-versions';
import { readTestManifest, type TestCaseEntry, type TestManifest } from './testcase-generator';
import {
  type Assertion, type AssertionResult, type TestStatus,
  runAssertions, extractToolsAndSkills, isInfraError, sleep,
  type AgentResultForAssertion,
} from './assertion-evaluator';
import { logger } from '../logger';

// ── 结果类型 ─────────────────────────────────────────────────────────────────

export interface CaseResult {
  case_id: string;
  title: string;
  category: string;
  status: TestStatus;
  assertions: AssertionResult[];
  transcript: Array<{ role: 'user' | 'assistant'; text: string }>;
  tools_called: string[];
  skills_loaded: string[];
  duration_ms: number;
}

export interface BatchResult {
  total: number;
  passed: number;
  failed: number;
  infra_error: number;
  results: CaseResult[];
}

// ── 单条执行 ─────────────────────────────────────────────────────────────────

const CASE_DELAY_MS = 2000; // 用例间退避，避免 429

/**
 * 执行单条测试用例（支持多轮对话）。
 */
export async function runSingleTestCase(
  skillId: string,
  versionNo: number,
  caseEntry: TestCaseEntry,
  personaContext?: Record<string, unknown>,
): Promise<CaseResult> {
  const startTime = Date.now();
  const tempDir = mkdtempSync(join(tmpdir(), 'tc-run-'));
  const sessionId = `tc_${skillId}_v${versionNo}_${caseEntry.id}`;

  try {
    const transcript: CaseResult['transcript'] = [];
    const allToolRecords: TestMessageResult['tool_records'] = [];
    let lastResult: TestMessageResult | null = null;
    const history: Array<{ role: string; content: string }> = [];

    // 逐轮执行
    for (const turn of caseEntry.turns) {
      transcript.push({ role: 'user', text: turn });

      const result = await runTestMessage({
        skill: skillId,
        version_no: versionNo,
        message: turn,
        history: [...history],
        persona: personaContext,
        lang: 'zh',
        useMock: true,
        session_id: sessionId,
        tempDir,
      });

      transcript.push({ role: 'assistant', text: result.text });
      allToolRecords.push(...result.tool_records);
      lastResult = result;

      // 累积 history 供下一轮
      history.push({ role: 'user', content: turn });
      history.push({ role: 'assistant', content: result.text });
    }

    // 从所有轮的结果中提取工具和技能
    const agentResultForAssertion: AgentResultForAssertion = {
      text: lastResult?.text,
      card: lastResult?.card,
      toolRecords: allToolRecords,
      transferData: lastResult?.transfer_data,
      skill_diagram: lastResult?.skill_diagram,
    };
    const { toolsCalled, skillsLoaded } = extractToolsAndSkills(agentResultForAssertion);

    // 运行断言
    const assertions = caseEntry.assertions as Assertion[];
    const assertionResults = runAssertions(assertions, lastResult?.text ?? '', toolsCalled, skillsLoaded);
    const allPassed = assertionResults.every(r => r.passed);

    return {
      case_id: caseEntry.id,
      title: caseEntry.title,
      category: caseEntry.category,
      status: allPassed ? 'passed' : 'failed',
      assertions: assertionResults,
      transcript,
      tools_called: toolsCalled,
      skills_loaded: skillsLoaded,
      duration_ms: Date.now() - startTime,
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

// ── 全量执行 ─────────────────────────────────────────────────────────────────

/**
 * 执行版本快照中所有测试用例。
 */
export async function runAllTestCases(
  skillId: string,
  versionNo: number,
  personaContext?: Record<string, unknown>,
): Promise<BatchResult> {
  const manifest = await readTestManifest(skillId, versionNo);
  if (!manifest) throw new Error(`版本 v${versionNo} 尚未生成测试用例`);

  const results: CaseResult[] = [];

  for (let i = 0; i < manifest.cases.length; i++) {
    const caseEntry = manifest.cases[i];

    try {
      const result = await runSingleTestCase(skillId, versionNo, caseEntry, personaContext);
      results.push(result);
    } catch (err) {
      if (isInfraError(err)) {
        // 基础设施错误：等待后重试一次
        logger.warn('testcase-run', 'infra_error_retry', { skillId, versionNo, caseId: caseEntry.id, error: String(err) });
        await sleep(5000);
        try {
          const retryResult = await runSingleTestCase(skillId, versionNo, caseEntry, personaContext);
          results.push(retryResult);
        } catch (retryErr) {
          results.push(makeInfraErrorResult(caseEntry, retryErr, Date.now()));
        }
      } else {
        results.push({
          case_id: caseEntry.id,
          title: caseEntry.title,
          category: caseEntry.category,
          status: 'failed',
          assertions: caseEntry.assertions.map(a => ({
            ...a, passed: false, detail: `执行异常: ${String(err)}`,
          })),
          transcript: [],
          tools_called: [],
          skills_loaded: [],
          duration_ms: 0,
        });
      }
    }

    // 用例间退避
    if (i < manifest.cases.length - 1) await sleep(CASE_DELAY_MS);
  }

  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const infraError = results.filter(r => r.status === 'infra_error').length;

  logger.info('testcase-run', 'batch_done', {
    skillId, versionNo,
    total: results.length, passed, failed, infra_error: infraError,
  });

  return { total: results.length, passed, failed, infra_error: infraError, results };
}

// ── 辅助 ─────────────────────────────────────────────────────────────────────

function makeInfraErrorResult(caseEntry: TestCaseEntry, err: unknown, startTime: number): CaseResult {
  return {
    case_id: caseEntry.id,
    title: caseEntry.title,
    category: caseEntry.category,
    status: 'infra_error',
    assertions: caseEntry.assertions.map(a => ({
      ...a, passed: false, detail: `基础设施异常（已重试）: ${String(err)}`,
    })),
    transcript: [],
    tools_called: [],
    skills_loaded: [],
    duration_ms: Date.now() - startTime,
  };
}
