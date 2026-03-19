# API 检查清单：智能电信客服系统

**目的**: 验证 API 契约的完备性和一致性
**创建日期**: 2026-03-19
**功能规格**: [contracts/apis.md](../contracts/apis.md)

## REST API 完整性

- [x] CHK062 POST /api/chat 是否已完整指定请求体、成功响应、错误响应和全部 4 种卡片类型？ [完整性]
- [x] CHK063 DELETE /api/sessions/:id 是否已指定级联行为？ [完整性]
- [x] CHK064 GET /health 是否已指定响应格式？ [完整性]
- [x] CHK065 Files API 端点（GET tree、GET content、PUT content）是否已完整指定？ [完整性]
- [ ] CHK066 所有错误场景的 HTTP 状态码是否已明确（400 参数错误、404 未找到、403 无权限、500 内部错误）？ [缺口]
- [ ] CHK067 请求/响应的 Content-Type 头是否已明确（假定 application/json 但未文档化）？ [缺口]
- [ ] CHK068 列表端点的分页是否已明确（GET /km/documents、GET /km/candidates 等）？查询参数：page、limit、total？ [缺口]
- [ ] CHK069 API 版本化要求是否已明确（/v1/ 前缀、基于 header 等）？ [缺口]

## WebSocket 协议完整性

- [x] CHK070 /ws/chat 的所有消息类型是否已文档化（chat_message → user_message/text_delta/skill_diagram_update/response/error）？ [完整性]
- [x] CHK071 /ws/agent 的所有消息类型是否已文档化（包括 emotion_update 和 handoff_card）？ [完整性]
- [x] CHK072 /ws/voice 的所有 GLM 透传事件和后端自定义事件是否已文档化？ [完整性]
- [x] CHK073 /ws/outbound 的所有工具和事件是否已文档化？ [完整性]
- [ ] CHK074 每个 WebSocket 端点的重连行为是否已明确？自动重连？退避策略？ [缺口]
- [ ] CHK075 WebSocket 心跳/ping-pong 机制是否已明确（用于检测失活连接）？ [缺口]
- [ ] CHK076 每个 WebSocket 端点的关闭码和关闭原因是否已文档化？ [缺口]
- [x] CHK077 /ws/agent 的 msg_id 去重策略是否已文档化？ [完整性]

## MCP 工具契约

- [x] CHK078 全部 15 个 MCP 工具是否已文档化 Zod 输入 schema、成功响应和失败响应？ [完整性]
- [ ] CHK079 每个 MCP 工具的超时要求是否已明确？ [缺口]
- [ ] CHK080 MCP 工具调用失败时的重试行为是否已明确？ [缺口]
- [ ] CHK081 MCP 工具响应的大小限制是否已明确？ [缺口]
- [x] CHK082 StreamableHTTP stateless 传输模式是否已文档化？ [完整性]
- [x] CHK083 全部 42 条 mock 规则是否已为测试目的文档化？ [完整性]

## 技能加载接口

- [x] CHK084 get_skill_instructions 是否已完整指定 skill_name 参数和响应格式？ [完整性]
- [x] CHK085 get_skill_reference 是否已完整指定 skill_name + filename 参数？ [完整性]
- [x] CHK086 GET /api/skills 的响应格式（含 channels 字段）是否已文档化？ [完整性]
- [ ] CHK087 请求的 skill_name 不存在时的行为是否已明确？ [缺口]
- [ ] CHK088 技能中请求的 reference 文件不存在时的行为是否已明确？ [缺口]

## 知识管理 API

- [x] CHK089 全部 9 个 KM 子模块（documents、candidates、evidence、conflicts、review-packages、action-drafts、assets、tasks、audit-logs）的 CRUD 端点是否已文档化？ [完整性]
- [ ] CHK090 gate-check 失败时的错误响应是否已文档化（含结构化 blocker 详情）？ [缺口]
- [ ] CHK091 POST /km/documents/versions/:vid/parse 管线状态的响应格式是否已文档化？ [缺口]

## 版本与变更管理 API

- [x] CHK092 技能版本生命周期端点（create-from、test、publish、diff）是否已文档化？ [完整性]
- [x] CHK093 变更审批生命周期端点（list、detail、approve、reject）是否已文档化？ [完整性]
- [x] CHK094 灰度发布端点（deploy、status、promote、rollback）是否已文档化？ [完整性]
- [ ] CHK095 版本 diff（LCS 算法输出）的响应格式是否已文档化？ [缺口]
- [ ] CHK096 发布版本时存在未保存 .draft 文件的错误响应是否已文档化？ [缺口]
