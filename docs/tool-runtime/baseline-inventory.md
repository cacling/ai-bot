# Tool Runtime Baseline Inventory

> Phase 0 snapshot — captured 2026-03-27

## 1. Tool Source Table

| Tool Name | Current Source | Server | Mocked | impl_type |
|-----------|--------------|--------|--------|-----------|
| query_subscriber | remote_mcp | user-info-service (:18003) | live | script |
| query_bill | remote_mcp | user-info-service (:18003) | live | script |
| query_plans | remote_mcp | user-info-service (:18003) | live | script |
| analyze_bill_anomaly | remote_mcp | user-info-service (:18003) | live | script |
| cancel_service | remote_mcp | business-service (:18004) | live | script |
| issue_invoice | remote_mcp | business-service (:18004) | live | api |
| diagnose_network | remote_mcp | diagnosis-service (:18005) | live | script |
| diagnose_app | remote_mcp | diagnosis-service (:18005) | live | script |
| record_call_result | remote_mcp | outbound-service (:18006) | live | script |
| send_followup_sms | remote_mcp | outbound-service (:18006) | live | script |
| create_callback_task | remote_mcp | outbound-service (:18006) | live | api |
| record_marketing_result | remote_mcp | outbound-service (:18006) | live | script |
| verify_identity | remote_mcp | account-service (:18007) | live | api |
| check_account_balance | remote_mcp | account-service (:18007) | live | script |
| check_contracts | remote_mcp | account-service (:18007) | live | script |
| apply_service_suspension | remote_mcp | account-service (:18007) | MOCKED | script |

**Total:** 16 tools across 5 MCP servers. 1 mocked tool (`apply_service_suspension`). No `tool_implementations` rows yet — all tools currently route through remote MCP.

## 2. MCP Server Table

| Server Name | URL | Port | Tool Count |
|------------|-----|------|-----------|
| user-info-service | http://127.0.0.1:18003/mcp | 18003 | 4 |
| business-service | http://127.0.0.1:18004/mcp | 18004 | 2 |
| diagnosis-service | http://127.0.0.1:18005/mcp | 18005 | 2 |
| outbound-service | http://127.0.0.1:18006/mcp | 18006 | 4 |
| account-service | http://127.0.0.1:18007/mcp | 18007 | 4 |

## 3. Connector Table

| Connector Name | Type | Status |
|---------------|------|--------|
| customer-api | api | active |
| billing-api | api | active |
| catalog-api | api | active |
| orders-api | api | active |
| invoice-api | api | active |
| identity-api | api | active |
| diagnosis-api | api | active |
| outreach-api | api | active |
| callback-api | api | active |

**Note:** 9 API connectors exist but no `tool_implementations` bind tools to them yet.

## 4. Calling Chain Summary

- **Online (`/ws/chat`):** `runner.ts` → `getMCPTools()` → persistent MCP client pool → StreamableHTTP to MCP servers. Mock wrapping, API routing (`TOOL_ROUTING_MODE`), SOP guard, and translation all applied as wrapping layers in `runAgent()`.

- **Voice (`/ws/voice`):** `voice.ts` → `callMcpTool()` (in `mcp-client.ts`) → per-call StreamableHTTP connection to MCP server. No persistent pool, no SOP guard, no translation.

- **Outbound (`/ws/outbound`):** Same as voice — `outbound.ts` → `callMcpTool()` → per-call MCP connection.

- **Workflow:** `tool-executor.ts` → `executeTool()` (in `skill-tool-executor.ts`) → uses injected `_mcpTools` map from runner context. Falls through same persistent pool as online.
