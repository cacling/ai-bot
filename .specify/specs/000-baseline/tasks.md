# 任务清单：智能电信客服系统（基线）

**功能**: 000-baseline | **日期**: 2026-03-19 | **状态**: 全部完成

> 每个 task 对应 [spec.md](spec.md) 中的用户故事。文件路径详见 [codebase-map.md](codebase-map.md)。

## 依赖与执行顺序

```
阶段 1（初始化）→ 阶段 2（基础设施）→ 阶段 3-10（用户故事，可并行）→ 阶段 11（收尾）
```

- 阶段 1 和 2 阻塞所有用户故事
- 阶段 3-10 可并行执行（独立的用户故事）
- 阶段 11 在所有用户故事完成后执行

---

## 阶段 1：初始化

- [x] T001 Initialize backend project with Bun + Hono `backend/package.json`
- [x] T002 Initialize frontend project with React 18 + Vite + Tailwind `frontend/package.json`
- [x] T003 Configure TypeScript for backend and frontend `backend/tsconfig.json`, `frontend/tsconfig.json`
- [x] T004 Create `.env` template with SiliconFlow + GLM-Realtime config `.env`
- [x] T005 Create startup scripts `start.sh`, `stop.sh`, `win-start.sh`, `win-stop.sh`

---

## 阶段 2：基础设施（⚠️ 阻塞所有用户故事）

### 数据库

- [x] T006 Define SQLite schema with Drizzle ORM — business tables (9) in `backend/src/db/schema/business.ts`, platform tables (21) in `backend/src/db/schema/platform.ts`
- [x] T007 Implement database seed with 3 test users + 4 plans + 4 value-added services `backend/src/db/seed.ts`
- [x] T008 Configure Drizzle Kit for schema push `backend/drizzle.config.ts`
- [x] T009 Unit tests for schema definitions (6 tests) `tests/unittest/backend/db/schema.test.ts`

### LLM 引擎

- [x] T010 Configure SiliconFlow LLM client via OpenAI adapter `backend/src/engine/llm.ts`
- [x] T011 Implement Agent runner with Vercel AI SDK generateText + ReAct loop (maxSteps=10) `backend/src/engine/runner.ts`
- [x] T012 Create system-prompt.md with {{PHONE}} and {{CURRENT_DATE}} placeholders `backend/src/engine/system-prompt.md`
- [x] T013 Implement Skills loader with channel-based routing `backend/src/engine/skills.ts`
- [x] T014 Unit tests for LLM provider/model (4 tests) `tests/unittest/backend/engine/llm.test.ts`
- [x] T015 Unit tests for getSkillsByChannel + refreshSkillsCache (8 tests) `tests/unittest/backend/engine/skills.test.ts`

### 共享服务

- [x] T016 [P] Implement structured JSON logger `backend/src/services/logger.ts`
- [x] T017 [P] Implement i18n with zh/en support `backend/src/services/i18n.ts`
- [x] T018 [P] Implement Session Bus (in-memory pub/sub) `backend/src/services/session-bus.ts`
- [x] T019 [P] Implement paths resolver (SKILLS_ROOT, BIZ_SKILLS_DIR, TECH_SKILLS_DIR) `backend/src/services/paths.ts`
- [x] T020 [P] Implement nanoid generator `backend/src/db/nanoid.ts`
- [x] T021 Unit tests for logger (6 tests) `tests/unittest/backend/services/logger.test.ts`
- [x] T022 Unit tests for i18n (12 tests) `tests/unittest/backend/services/i18n.test.ts`
- [x] T023 Unit tests for session-bus (8 tests) `tests/unittest/backend/services/session-bus.test.ts`
- [x] T024 Unit tests for paths (4 tests) `tests/unittest/backend/services/paths.test.ts`
- [x] T025 Unit tests for nanoid (4 tests) `tests/unittest/backend/services/nanoid.test.ts`

### MCP Server 基础设施

- [x] T026 Implement user-info-service MCP Server (:18003) with query_subscriber, query_bill, query_plans `mcp_servers/src/services/user-info-service.ts`
- [x] T027 Implement business-service MCP Server (:18004) with cancel_service, issue_invoice `mcp_servers/src/services/business-service.ts`
- [x] T028 Implement diagnosis-service MCP Server (:18005) with diagnose_network, diagnose_app `mcp_servers/src/services/diagnosis-service.ts`
- [x] T029 Implement MCP client connector `backend/src/services/mcp-client.ts`
- [x] T030 Unit tests for mcp-client error handling (3 tests) `tests/unittest/backend/services/mcp-client.test.ts`

### Hono 服务入口

- [x] T031 Implement Hono server with health check + CORS + static files `backend/src/index.ts`

---

## 阶段 3：用户故事 1 — 账单查询（P1）

### 技能

- [x] T032 [US1] Create bill-inquiry SKILL.md with Mermaid state diagram + tool/branch annotations `backend/skills/biz-skills/bill-inquiry/SKILL.md`
- [x] T033 [US1] Create billing-rules reference document `backend/skills/biz-skills/bill-inquiry/references/billing-rules.md`

### 后端

- [x] T034 [US1] Implement POST /api/chat endpoint with bill_card extraction `backend/src/chat/chat.ts`
- [x] T035 [US1] Implement Mermaid highlight for bill-inquiry (highlightMermaidTool) `backend/src/engine/runner.ts`

### 前端

- [x] T036 [US1] Implement ChatPage with chat bubbles + bill_card rendering `frontend/src/chat/ChatPage.tsx`
- [x] T037 [US1] Implement CardMessage component for bill_card `frontend/src/chat/CardMessage.tsx`

### 测试

- [x] T038 [US1] Unit tests for CardMessage bill_card (31 tests, shared) `tests/unittest/frontend/chat/CardMessage.test.tsx`
- [x] T039 [US1] E2E test: chat page structure + bill query (13 tests) `tests/e2e/01-chat-page.spec.ts`
- [x] T040 [US1] E2E test: Chat API bill_card response (26 tests, shared) `tests/e2e/03-api-endpoints.spec.ts`
- [x] T041 [US1] E2E test: bill_card frontend rendering (10 tests, shared) `tests/e2e/04-telecom-cards.spec.ts`

---

## 阶段 4：用户故事 2 — 业务退订（P1）

### 技能

- [x] T042 [US2] Create service-cancel SKILL.md with confirmation flow in state diagram `backend/skills/biz-skills/service-cancel/SKILL.md`
- [x] T043 [US2] Create cancellation-policy reference document `backend/skills/biz-skills/service-cancel/references/cancellation-policy.md`

### 后端

- [x] T044 [US2] Implement cancel_card extraction in runner.ts `backend/src/engine/runner.ts`

### 前端

- [x] T045 [US2] Implement cancel_card rendering in CardMessage `frontend/src/chat/CardMessage.tsx`

### 测试

- [x] T046 [US2] E2E test: cancel_card rendering `tests/e2e/04-telecom-cards.spec.ts`

---

## 阶段 5：用户故事 3 — 套餐咨询（P2）

### 技能

- [x] T047 [US3] Create plan-inquiry SKILL.md with parallel tool invocation pattern `backend/skills/biz-skills/plan-inquiry/SKILL.md`
- [x] T048 [US3] Create plan-details reference document `backend/skills/biz-skills/plan-inquiry/references/plan-details.md`

### 前端

- [x] T049 [US3] Implement plan_card rendering in CardMessage `frontend/src/chat/CardMessage.tsx`

### 测试

- [x] T050 [US3] E2E test: plan_card rendering `tests/e2e/04-telecom-cards.spec.ts`

---

## 阶段 6：用户故事 4 — 网络故障诊断（P2）

### 技能

- [x] T051 [US4] Create fault-diagnosis SKILL.md with branch annotations `backend/skills/biz-skills/fault-diagnosis/SKILL.md`
- [x] T052 [US4] Create troubleshoot-guide reference `backend/skills/biz-skills/fault-diagnosis/references/troubleshoot-guide.md`
- [x] T053 [US4] Implement diagnosis scripts (run_diagnosis, check_account, check_signal, check_data, check_call) `backend/skills/biz-skills/fault-diagnosis/scripts/`

### 后端

- [x] T054 [US4] Implement Mermaid branch highlighting (determineBranch + highlightMermaidBranch) `backend/src/engine/runner.ts`
- [x] T055 [US4] Implement SKILL_TOOL_MAP for diagnose_network → fault-diagnosis mapping `backend/src/engine/runner.ts`

### 前端

- [x] T056 [US4] Implement diagnostic_card rendering `frontend/src/chat/CardMessage.tsx`

### 测试

- [x] T057 [US4] Unit tests for Mermaid extract/highlight/strip/states/transitions (38 tests) `tests/unittest/backend/services/mermaid.test.ts`
- [x] T058 [US4] Unit tests for runner diagram functions (50+ tests) `tests/unittest/backend/runner.diagram.test.ts`
- [x] T059 [US4] E2E test: 4 fault diagnosis scenarios + edge cases (5 tests) `tests/e2e/06-fault-diagnosis.spec.ts`

---

## 阶段 7：用户故事 5 — 语音客服（P2）

### 后端

- [x] T060 [US5] Implement GLM-Realtime WebSocket proxy `backend/src/chat/voice.ts`
- [x] T061 [US5] Create inbound-voice-system-prompt.md with {{CURRENT_DATE}} `backend/src/engine/inbound-voice-system-prompt.md`
- [x] T062 [US5] Define VOICE_TOOLS (6 tools in flat format) `backend/src/chat/voice.ts`
- [x] T063 [US5] Implement VoiceSessionState (turns, toolCalls, slots, transferTriggered) `backend/src/services/voice-session.ts`
- [x] T064 [US5] Implement triggerHandoff with dual-path detection (tool call + TRANSFER_PHRASE_RE) `backend/src/services/voice-common.ts`
- [x] T065 [US5] Implement emotion-analyzer (5-class async LLM) `backend/src/agent/card/emotion-analyzer.ts`
- [x] T066 [US5] Implement handoff-analyzer (single LLM call → JSON + summary) `backend/src/agent/card/handoff-analyzer.ts`
- [x] T067 [P] [US5] Implement TTS service (SiliconFlow CosyVoice2) `backend/src/services/tts.ts`
- [x] T068 [P] [US5] Implement multi-language translation service `backend/src/services/translate-lang.ts`
- [x] T069 [P] [US5] Implement language session manager `backend/src/services/lang-session.ts`

### 前端

- [x] T070 [US5] Implement VoiceChatPage with AudioContext + MediaSource pipeline `frontend/src/chat/VoiceChatPage.tsx`
- [x] T071 [US5] Implement useVoiceEngine shared hook `frontend/src/chat/hooks/useVoiceEngine.ts`

### 技能

- [x] T072 [US5] Create emotion-detection SKILL.md `backend/skills/tech-skills/emotion-detection/SKILL.md`
- [x] T073 [US5] Create handoff-analysis SKILL.md `backend/skills/tech-skills/handoff-analysis/SKILL.md`

### 测试

- [x] T074 [US5] Unit tests for VoiceSessionState (18 tests) `tests/unittest/backend/services/voice-session.test.ts`
- [x] T075 [US5] Unit tests for voice-common helpers (11 tests) `tests/unittest/backend/services/voice-common.test.ts`
- [x] T076 [US5] Unit tests for emotion-analyzer (card tests, 25 shared) `tests/unittest/backend/agent/card/emotion-analyzer.test.ts`
- [x] T077 [US5] Unit tests for handoff-analyzer `tests/unittest/backend/agent/card/handoff-analyzer.test.ts`
- [x] T078 [US5] Unit tests for TTS (7 tests) `tests/unittest/backend/services/tts.test.ts`
- [x] T079 [US5] Unit tests for translate-lang (2 tests) `tests/unittest/backend/services/translate-lang.test.ts`
- [x] T080 [US5] Unit tests for lang-session (6 tests) `tests/unittest/backend/services/lang-session.test.ts`
- [x] T081 [US5] Frontend tests for VoiceChatPage (5 tests) `tests/unittest/frontend/chat/VoiceChatPage.test.tsx`
- [x] T082 [US5] Frontend tests for useVoiceEngine (8 tests) `tests/unittest/frontend/chat/hooks/useVoiceEngine.test.ts`

---

## 阶段 8：用户故事 6 — 坐席工作台（P3）

### 后端

- [x] T083 [US6] Implement agent-ws WebSocket route with Session Bus subscription `backend/src/agent/chat/agent-ws.ts`
- [x] T084 [US6] Implement compliance keyword filter (AC automaton) `backend/src/services/keyword-filter.ts`
- [x] T085 [US6] Implement chat-ws WebSocket route with Session Bus integration `backend/src/chat/chat-ws.ts`

### 前端

- [x] T086 [US6] Implement AgentWorkstationPage with user selector + WS + chat area `frontend/src/agent/AgentWorkstationPage.tsx`
- [x] T087 [US6] Implement CardPanel (2-col grid, drag-and-drop, restore chips) `frontend/src/agent/cards/CardPanel.tsx`
- [x] T088 [US6] Implement CardShell (header, collapse, close) `frontend/src/agent/cards/CardShell.tsx`
- [x] T089 [US6] Implement card registry (registerCard, findCardByEvent, buildInitialCardStates) `frontend/src/agent/cards/registry.ts`
- [x] T090 [P] [US6] Implement EmotionContent card (gradient track + indicator) `frontend/src/agent/cards/contents/EmotionContent.tsx`
- [x] T091 [P] [US6] Implement HandoffContent card (summary + priority badge + risk flags) `frontend/src/agent/cards/contents/HandoffContent.tsx`
- [x] T092 [P] [US6] Implement DiagramContent card (Mermaid renderer) `frontend/src/agent/cards/contents/DiagramContent.tsx`
- [x] T093 [P] [US6] Implement ComplianceContent card (alert list) `frontend/src/agent/cards/contents/ComplianceContent.tsx`
- [x] T094 [US6] Implement cross-window user sync via BroadcastChannel `frontend/src/chat/userSync.ts`

### 测试

- [x] T095 [US6] Unit tests for keyword-filter (16 tests) `tests/unittest/backend/services/keyword-filter.test.ts`
- [x] T096 [US6] Unit tests for agent-ws (16 tests) `tests/unittest/backend/agent/chat/agent-ws.test.ts`
- [x] T097 [US6] Unit tests for chat-ws (9 tests) `tests/unittest/backend/chat/chat-ws.test.ts`
- [x] T098 [US6] Frontend tests for AgentWorkstationPage (5 tests) `tests/unittest/frontend/agent/AgentWorkstationPage.test.tsx`
- [x] T099 [US6] Frontend tests for CardPanel (3 tests) `tests/unittest/frontend/agent/cards/CardPanel.test.tsx`
- [x] T100 [US6] Frontend tests for CardShell (8 tests) `tests/unittest/frontend/agent/cards/CardShell.test.tsx`
- [x] T101 [US6] Frontend tests for registry (7 tests) `tests/unittest/frontend/agent/cards/registry.test.ts`
- [x] T102 [US6] Frontend tests for card index (8 tests) `tests/unittest/frontend/agent/cards/index.test.ts`
- [x] T103 [US6] Frontend tests for 6 card contents (43 tests) `tests/unittest/frontend/agent/cards/contents/`
- [x] T104 [US6] Frontend tests for userSync (3 tests) `tests/unittest/frontend/chat/userSync.test.ts`

---

## 阶段 9：用户故事 7 — 外呼语音（P3）

### 数据库

- [x] T105 [US7] Add outbound_tasks + callback_tasks + device_contexts tables to schema `backend/src/db/schema.ts`
- [x] T106 [US7] Seed outbound tasks (3 collection + 3 marketing) `backend/src/db/seed.ts`

### 后端

- [x] T107 [US7] Implement outbound WebSocket route with GLM-Realtime proxy `backend/src/chat/outbound.ts`
- [x] T108 [US7] Implement outbound-service MCP Server (:18006) `mcp_servers/src/services/outbound-service.ts`
- [x] T109 [US7] Implement account-service MCP Server (:18007) `mcp_servers/src/services/account-service.ts`
- [x] T110 [US7] Create outbound-collection SKILL.md `backend/skills/biz-skills/outbound-collection/SKILL.md`
- [x] T111 [US7] Create outbound-marketing SKILL.md `backend/skills/biz-skills/outbound-marketing/SKILL.md`
- [x] T112 [US7] Create outbound voice system prompt `backend/src/engine/outbound-voice-system-prompt.md`
- [x] T113 [US7] Implement mock data routes (GET /api/mock-users, /api/outbound-tasks) `backend/src/chat/mock-data.ts`

### 前端

- [x] T114 [US7] Implement OutboundVoicePage with mic gating + task switching `frontend/src/chat/OutboundVoicePage.tsx`
- [x] T115 [P] [US7] Implement OutboundTaskContent card `frontend/src/agent/cards/contents/OutboundTaskContent.tsx`
- [x] T116 [P] [US7] Implement UserDetailContent card `frontend/src/agent/cards/contents/UserDetailContent.tsx`

### 测试

- [x] T117 [US7] Unit tests for outbound types (3 tests) `tests/unittest/backend/chat/outbound-types.test.ts`
- [x] T118 [US7] Unit tests for outbound mock data (2 tests) `tests/unittest/backend/chat/outbound-mock.test.ts`
- [x] T119 [US7] Unit tests for outbound (5 tests) `tests/unittest/backend/outbound.test.ts`
- [x] T120 [US7] Unit tests for mock-data routes (7 tests) `tests/unittest/backend/chat/mock-data.test.ts`
- [x] T121 [US7] Frontend tests for OutboundVoicePage (5 tests) `tests/unittest/frontend/chat/OutboundVoicePage.test.tsx`

---

## 阶段 10：用户故事 8 — 知识管理（P3）

### 数据库

- [x] T122 [US8] Add skill_registry + skill_versions tables `backend/src/db/schema.ts`
- [x] T123 [US8] Add users table with RBAC roles `backend/src/db/schema.ts`
- [x] T124 [US8] Add change_requests + test_cases tables `backend/src/db/schema.ts`
- [x] T125 [US8] Add mcp_servers + mcp_tools + mcp_mock_rules tables `backend/src/db/schema.ts`
- [x] T126 [US8] Add 13 km_ prefixed tables (documents → audit_logs) `backend/src/db/schema.ts`

### 后端 — 技能管理

- [x] T127 [US8] Implement skill version manager (create-from, publish, diff) `backend/src/agent/km/skills/version-manager.ts`
- [x] T128 [US8] Implement skill versions API (CRUD + test + publish) `backend/src/agent/km/skills/skill-versions.ts`
- [x] T129 [US8] Implement sandbox testing with overrideSkillsDir `backend/src/agent/km/skills/sandbox.ts`
- [x] T130 [US8] Implement AI skill creator (multi-turn interview → draft → save) `backend/src/agent/km/skills/skill-creator.ts`
- [x] T131 [US8] Implement natural language skill editing (clarify → diff → apply) `backend/src/agent/km/skills/skill-edit.ts`
- [x] T132 [US8] Implement canary deployment (percentage-based routing) `backend/src/agent/km/skills/canary.ts`
- [x] T133 [US8] Implement high-risk change detection + approval workflow `backend/src/agent/km/skills/change-requests.ts`
- [x] T134 [US8] Implement regression test cases with 6 assertion types `backend/src/agent/km/skills/test-cases.ts`
- [x] T135 [US8] Implement file management API (tree, read, write, create) `backend/src/agent/km/skills/files.ts`
- [x] T136 [US8] Create skill-creator-spec system prompt template `backend/skills/tech-skills/skill-creator-spec/SKILL.md`
- [x] T137 [US8] Create biz-skill-spec reference document `backend/skills/tech-skills/skill-creator-spec/references/biz-skill-spec.md`

### 后端 — 知识管理（KMS）

- [x] T138 [P] [US8] Implement documents API (upload, versions, parse pipeline) `backend/src/agent/km/kms/documents.ts`
- [x] T139 [P] [US8] Implement candidates API (CRUD + gate check) `backend/src/agent/km/kms/candidates.ts`
- [x] T140 [P] [US8] Implement evidence API (create, review) `backend/src/agent/km/kms/evidence.ts`
- [x] T141 [P] [US8] Implement conflicts API (create, resolve) `backend/src/agent/km/kms/conflicts.ts`
- [x] T142 [P] [US8] Implement review-packages API (submit, approve, reject) `backend/src/agent/km/kms/review-packages.ts`
- [x] T143 [P] [US8] Implement action-drafts API (create, execute) `backend/src/agent/km/kms/action-drafts.ts`
- [x] T144 [P] [US8] Implement assets API (list, detail, versions) `backend/src/agent/km/kms/assets.ts`
- [x] T145 [P] [US8] Implement governance tasks API `backend/src/agent/km/kms/tasks.ts`
- [x] T146 [P] [US8] Implement audit logs API `backend/src/agent/km/kms/audit.ts`
- [x] T147 [US8] Implement KMS route aggregator `backend/src/agent/km/kms/index.ts`

### 后端 — 认证与 MCP 管理

- [x] T148 [US8] Implement RBAC middleware (requireRole) `backend/src/services/auth.ts`
- [x] T149 [US8] Implement skills CRUD API `backend/src/agent/km/skills/skills.ts`
- [x] T150 [US8] Implement progress-tracker for voice sessions `backend/src/agent/card/progress-tracker.ts`
- [x] T151 [US8] Implement hallucination detector `backend/src/services/hallucination-detector.ts`

### 前端 — 技能编辑器

- [x] T152 [US8] Implement EditorPage (3-column layout: file tree + editor + chat/test) `frontend/src/km/EditorPage.tsx`
- [x] T153 [US8] Implement SkillManagerPage `frontend/src/km/SkillManagerPage.tsx`
- [x] T154 [P] [US8] Implement FileTree component `frontend/src/km/components/FileTree.tsx`
- [x] T155 [P] [US8] Implement MarkdownEditor component `frontend/src/km/components/MarkdownEditor.tsx`
- [x] T156 [P] [US8] Implement PipelinePanel component `frontend/src/km/components/PipelinePanel.tsx`
- [x] T157 [P] [US8] Implement VersionPanel component `frontend/src/km/components/VersionPanel.tsx`
- [x] T158 [P] [US8] Implement SandboxPanel component `frontend/src/km/components/SandboxPanel.tsx`
- [x] T159 [P] [US8] Implement NLEditPanel component `frontend/src/km/components/NLEditPanel.tsx`
- [x] T160 [US8] Implement useSkillManager hook `frontend/src/km/hooks/useSkillManager.ts`

### 前端 — 知识管理

- [x] T161 [US8] Implement KnowledgeManagementPage + sub-pages `frontend/src/km/KnowledgeManagementPage.tsx`
- [x] T162 [US8] Implement KM API helpers `frontend/src/km/api.ts`
- [x] T163 [US8] Implement MCP management components `frontend/src/km/mcp/`

### 测试 — 技能管理

- [x] T164 [US8] Unit tests for skill-versions diff (9 tests) `tests/unittest/backend/skill-versions.test.ts`
- [x] T165 [US8] Unit tests for sandbox (6 tests) `tests/unittest/backend/sandbox.test.ts`
- [x] T166 [US8] Unit tests for canary (in card tests) `tests/unittest/backend/agent/km/skills/canary.test.ts`
- [x] T167 [US8] Unit tests for change-requests `tests/unittest/backend/agent/km/skills/change-requests.test.ts`
- [x] T168 [US8] Unit tests for test-cases `tests/unittest/backend/agent/km/skills/test-cases.test.ts`
- [x] T169 [US8] Unit tests for skill-creator `tests/unittest/backend/agent/km/skills/skill-creator.test.ts`
- [x] T170 [US8] Unit tests for skill-edit `tests/unittest/backend/agent/km/skills/skill-edit.test.ts`
- [x] T171 [US8] Unit tests for files `tests/unittest/backend/agent/km/skills/files.test.ts`

### 测试 — 知识管理

- [x] T172 [P] [US8] Unit tests for documents (95 tests, km/kms shared) `tests/unittest/backend/agent/km/kms/documents.test.ts`
- [x] T173 [P] [US8] Unit tests for candidates `tests/unittest/backend/agent/km/kms/candidates.test.ts`
- [x] T174 [P] [US8] Unit tests for evidence `tests/unittest/backend/agent/km/kms/evidence.test.ts`
- [x] T175 [P] [US8] Unit tests for conflicts `tests/unittest/backend/agent/km/kms/conflicts.test.ts`
- [x] T176 [P] [US8] Unit tests for review-packages `tests/unittest/backend/agent/km/kms/review-packages.test.ts`
- [x] T177 [P] [US8] Unit tests for action-drafts `tests/unittest/backend/agent/km/kms/action-drafts.test.ts`
- [x] T178 [P] [US8] Unit tests for assets `tests/unittest/backend/agent/km/kms/assets.test.ts`
- [x] T179 [P] [US8] Unit tests for tasks `tests/unittest/backend/agent/km/kms/tasks.test.ts`
- [x] T180 [P] [US8] Unit tests for audit `tests/unittest/backend/agent/km/kms/audit.test.ts`
- [x] T181 [US8] Unit tests for helpers `tests/unittest/backend/agent/km/kms/helpers.test.ts`

### 测试 — 前端知识管理

- [x] T182 [US8] Frontend tests for KM API (34 tests) `tests/unittest/frontend/km/api.test.ts`
- [x] T183 [US8] Frontend tests for MCP API (11 tests) `tests/unittest/frontend/km/mcp/api.test.ts`
- [x] T184 [US8] Frontend tests for useSkillManager (20 tests) `tests/unittest/frontend/km/hooks/useSkillManager.test.ts`
- [x] T185 [US8] Frontend tests for MCP management components (12 tests) `tests/unittest/frontend/km/mcp/`
- [x] T186 [US8] Frontend tests for KM pages (~60 tests) `tests/unittest/frontend/km/`
- [x] T187 [US8] Frontend tests for editor components (~35 tests) `tests/unittest/frontend/km/components/`

### 测试 — E2E

- [x] T188 [US8] E2E test: skill lifecycle (create→sandbox→publish→effect, 13 tests) `tests/e2e/07-skill-lifecycle.spec.ts`
- [x] T189 [US8] E2E test: MCP management CRUD `tests/e2e/08-mcp-management.spec.ts`
- [x] T190 [US8] E2E test: sandbox mock mode `tests/e2e/09-sandbox-mock.spec.ts`
- [x] T191 [US8] E2E test: skill version test→publish flow `tests/e2e/10-skill-test-flow.spec.ts`

---

## 阶段 11：收尾与横切关注点

### 电信 App 技能

- [x] T192 Create telecom-app SKILL.md (App 问题诊断) `backend/skills/biz-skills/telecom-app/SKILL.md`
- [x] T193 Add diagnose_app to SKILL_TOOL_MAP `backend/src/engine/runner.ts`

### 可观测性

- [x] T194 Extend VoiceSessionState with metrics (首包时延 avg/p95, 打断, 冷场, 时长) `backend/src/services/voice-session.ts`
- [x] T195 Add session_summary logging to chat-ws onClose `backend/src/chat/chat-ws.ts`
- [x] T196 Unit tests for progress-tracker (2 tests) `tests/unittest/backend/agent/card/progress-tracker.test.ts`
- [x] T197 Unit tests for hallucination-detector (3 tests) `tests/unittest/backend/services/hallucination-detector.test.ts`
- [x] T198 Unit tests for tool-result (8 tests) `tests/unittest/backend/services/tool-result.test.ts`

### 前端共享

- [x] T199 Implement audio utilities (float32ToInt16, arrayBufferToBase64) `frontend/src/shared/audio.ts`
- [x] T200 Implement DiagramPanel component `frontend/src/shared/DiagramPanel.tsx`
- [x] T201 Implement Mermaid renderer `frontend/src/shared/mermaid.ts`
- [x] T202 Frontend tests for audio (18 tests) `tests/unittest/frontend/shared/audio.test.ts`
- [x] T203 Frontend tests for mermaid (4 tests) `tests/unittest/frontend/shared/mermaid.test.ts`
- [x] T204 Frontend tests for DiagramPanel (3 tests) `tests/unittest/frontend/shared/DiagramPanel.test.tsx`

### E2E 集成

- [x] T205 E2E test: real backend health + multi-turn context (11 tests) `tests/e2e/05-real-backend.spec.ts`
- [x] T206 Create test scripts (start.sh, stop.sh, seed.sh) `tests/scripts/`
- [x] T207 Configure Playwright (chrome, workers:1, retries:1, 90s timeout) `tests/e2e/playwright.config.ts`

### 前端 API 与路由

- [x] T208 Implement frontend API helpers `frontend/src/chat/api.ts`
- [x] T209 Implement App routing (/, /agent, /voice, /outbound, /km) `frontend/src/App.tsx`
- [x] T210 Frontend tests for API helpers (4 tests) `tests/unittest/frontend/chat/api.test.ts`
- [x] T211 Frontend tests for mockUsers (4 tests) `tests/unittest/frontend/chat/mockUsers.test.ts`
- [x] T212 Frontend tests for outboundData (8 tests) `tests/unittest/frontend/chat/outboundData.test.ts`

---

## 总结

| 指标 | 数值 |
|------|------|
| 总任务数 | 212 |
| 已完成 | 212 (100%) |
| 用户故事数 | 8 |
| 后端单元测试 | 580 (52 files) |
| 前端单元测试 | 382 (53 files) |
| E2E 测试 | 78 (9 files) |
| 文件覆盖率 | 93% |
