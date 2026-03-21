/**
 * 平台表 — re-export from @ai-bot/shared-db
 *
 * backend 拥有这些表，直接读写。
 */
export {
  sessions,
  messages,
  users,
  skillRegistry,
  skillVersions,
  changeRequests,
  testCases,
  testPersonas,
  outboundTasks,
  kmDocuments,
  kmDocVersions,
  kmPipelineJobs,
  kmCandidates,
  kmEvidenceRefs,
  kmConflictRecords,
  kmReviewPackages,
  kmActionDrafts,
  kmAssets,
  kmAssetVersions,
  kmGovernanceTasks,
  kmRegressionWindows,
  kmAuditLogs,
  mcpServers,
} from '../../../../packages/shared-db/src/schema/platform';
