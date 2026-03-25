import { describe, test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { compileWorkflow } from '../../../src/engine/skill-workflow-compiler';
import { adaptWorkflowSpec } from '../../../src/workflow/adapter';
import { registerDefaultExecutors } from '../../../src/workflow/executors';
import { NodeType } from '../../../src/workflow/types';

beforeAll(() => {
  registerDefaultExecutors();
});

describe('V2 Engine Integration', () => {
  test('real service-cancel spec adapts to WorkflowDefinition', () => {
    const mdPath = resolve(__dirname, '../../../skills/biz-skills/service-cancel/SKILL.md');
    const md = readFileSync(mdPath, 'utf-8');
    const compiled = compileWorkflow(md, 'service-cancel', 1);
    expect(compiled.errors).toEqual([]);

    const def = adaptWorkflowSpec(compiled.spec!);
    expect(def.nodes.length).toBeGreaterThan(10);
    expect(def.edges.length).toBeGreaterThan(5);

    // Verify node type distribution
    const types = def.nodes.map(n => n.type);
    expect(types).toContain(NodeType.Tool);
    expect(types).toContain(NodeType.End);
  });

  test('useV2Engine returns false by default', () => {
    delete process.env.WORKFLOW_ENGINE_V2;
    const { useV2Engine } = require('../../../src/engine/skill-router');
    expect(useV2Engine()).toBe(false);
  });

  test('useV2Engine returns true when WORKFLOW_ENGINE_V2=true', () => {
    process.env.WORKFLOW_ENGINE_V2 = 'true';
    // Re-import via direct call (env is read at call time, not module load time)
    const { useV2Engine } = require('../../../src/engine/skill-router');
    expect(useV2Engine()).toBe(true);
    delete process.env.WORKFLOW_ENGINE_V2;
  });
});
