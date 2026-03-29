/**
 * Stub symbols for mock.module() in km_service API tests.
 *
 * In km_service, db.ts re-exports schema tables and drizzle operators.
 * engine-stubs.ts, paths.ts, version-manager.ts also have many exports.
 * When mocking these modules, we need stubs for all exports.
 */
const stubTable = Symbol('stub-table');
const noop = () => {};
const noopAsync = async () => {};

export const tableStubs = {
  // KM tables
  kmDocuments: stubTable,
  kmDocVersions: stubTable,
  kmDocChunks: stubTable,
  kmPipelineJobs: stubTable,
  kmCandidates: stubTable,
  kmEvidenceRefs: stubTable,
  kmConflictRecords: stubTable,
  kmReviewPackages: stubTable,
  kmActionDrafts: stubTable,
  kmAssets: stubTable,
  kmAssetVersions: stubTable,
  kmGovernanceTasks: stubTable,
  kmRegressionWindows: stubTable,
  kmAuditLogs: stubTable,
  kmReplyFeedback: stubTable,
  kmRetrievalEvalCases: stubTable,
  // Platform tables
  mcpServers: stubTable,
  mcpTools: stubTable,
  connectors: stubTable,
  toolImplementations: stubTable,
  executionRecords: stubTable,
  skillRegistry: stubTable,
  skillVersions: stubTable,
  changeRequests: stubTable,
  testCases: stubTable,
  testPersonas: stubTable,
  skillToolBindings: stubTable,
  skillWorkflowSpecs: stubTable,
  skillInstances: stubTable,
  skillInstanceEvents: stubTable,
  mcpPrompts: stubTable,
  mcpServerSyncRuns: stubTable,
  // Drizzle operators
  eq: noop,
  and: noop,
  desc: noop,
  asc: noop,
  sql: noop,
  count: noop,
  like: noop,
  or: noop,
  between: noop,
  inArray: noop,
  sqlite: {},
};

/** Stubs for paths.ts exports */
export const pathsStubs = {
  REPO_ROOT: '/mock/repo',
  BACKEND_ROOT: '/mock/repo/backend',
  SKILLS_ROOT: '/mock/repo/backend/skills',
  BIZ_SKILLS_DIR: '/mock/repo/backend/skills/biz-skills',
  TECH_SKILLS_DIR: '/mock/repo/backend/skills/tech-skills',
};

/** Stubs for engine-stubs.ts exports */
export const engineStubs = {
  getAvailableSkills: () => [],
  getSkillContent: () => null,
  getSkillMermaid: () => null,
  refreshSkillsCache: noop,
  getToolToSkillsMap: () => new Map(),
  extractSkillMetadata: () => ({ description: '', channels: ['online'], mode: 'inbound', triggerKeywords: [], toolNames: [], mermaid: null, tags: [] }),
  syncSkillMetadata: noop,
  compileWorkflow: () => ({ spec: null, errors: [], warnings: [] }),
  runAgent: async () => ({ text: 'mock response' }),
  SOP_ENFORCEMENT_SUFFIX: '\n---\nSOP\n',
};

/** Stubs for version-manager.ts exports */
export const versionManagerStubs = {
  getVersionList: async () => [],
  getVersionDetail: () => null,
  markVersionSaved: noop,
  publishVersion: async () => ({ success: true }),
  createVersionFrom: async () => ({ version_no: 2 }),
  listSkillRegistry: () => [],
  initializeSkillVersion: noopAsync,
};
