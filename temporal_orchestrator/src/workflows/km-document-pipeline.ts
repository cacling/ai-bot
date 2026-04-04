import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
} from '@temporalio/workflow';

import type { KmDocumentPipelineInput, KmDocumentPipelineResult } from '../types.js';
import type * as kmActivities from '../activities/km.js';

const {
  enqueuePipelineJobs,
  runPipelineStage,
  markPipelineJobStatus,
  createGovernanceTask,
} = proxyActivities<typeof kmActivities>({
  startToCloseTimeout: '2m',
  retry: { maximumAttempts: 3 },
});

// ─── Signals ───

export const retryFromStageSignal = defineSignal<[{ stage: string }]>('retryFromStage');
export const cancelPipelineSignal = defineSignal('cancelPipeline');

// ─── Query ───

interface PipelineStatus {
  docVersionId: string;
  currentStage: string | null;
  completedStages: string[];
  failedStage: string | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
}

export const getPipelineStatusQuery = defineQuery<PipelineStatus>('getPipelineStatus');

export async function kmDocumentPipelineWorkflow(
  input: KmDocumentPipelineInput,
): Promise<KmDocumentPipelineResult> {
  const { docVersionId, stages } = input;

  let currentStage: string | null = null;
  let failedStage: string | null = null;
  const completedStages: string[] = [];
  let cancelled = false;
  let retryFromStage: string | null = null;
  let pipelineStatus: PipelineStatus['status'] = 'running';

  // Query handler
  setHandler(getPipelineStatusQuery, () => ({
    docVersionId,
    currentStage,
    completedStages: [...completedStages],
    failedStage,
    status: pipelineStatus,
  }));

  // Signal handlers
  setHandler(cancelPipelineSignal, () => {
    cancelled = true;
  });

  setHandler(retryFromStageSignal, ({ stage }) => {
    retryFromStage = stage;
  });

  // 1. Enqueue pipeline jobs
  const { jobs } = await enqueuePipelineJobs(docVersionId, stages);
  const jobMap = new Map(jobs.map((j) => [j.stage, j.id]));

  // 2. Execute stages sequentially
  const stagesToRun = [...stages];

  for (const stage of stagesToRun) {
    if (cancelled) {
      pipelineStatus = 'cancelled';
      return { docVersionId, finalStatus: 'failed' };
    }

    const jobId = jobMap.get(stage);
    if (!jobId) continue;

    currentStage = stage;
    await markPipelineJobStatus(jobId, 'running');

    const result = await runPipelineStage(jobId, stage);

    if (result.status === 'completed') {
      await markPipelineJobStatus(jobId, 'completed', undefined, undefined, undefined);
      completedStages.push(stage);
    } else {
      // Stage failed
      failedStage = stage;
      await markPipelineJobStatus(jobId, 'failed', 'stage_failed', result.error);
      await createGovernanceTask({
        task_type: 'pipeline_failure',
        source_type: 'doc_version',
        source_ref_id: docVersionId,
        issue_category: `${stage}_failed`,
        severity: 'medium',
        priority: 'medium',
      });
      pipelineStatus = 'failed';
      return { docVersionId, finalStatus: 'governance_created' };
    }
  }

  currentStage = null;
  pipelineStatus = 'completed';
  return { docVersionId, finalStatus: 'completed' };
}
