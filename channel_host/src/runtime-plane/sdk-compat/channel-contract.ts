/**
 * openclaw/plugin-sdk/channel-contract compatibility
 */

export type BaseProbeResult = { ok: boolean; issues?: ChannelStatusIssue[] };
export type BaseTokenResolution = { token: string; source: string };
export type ChannelAgentTool = Record<string, unknown>;
export type ChannelAccountSnapshot = Record<string, unknown>;
export type ChannelCommandConversationContext = Record<string, unknown>;
export type ChannelGroupContext = { groupId: string; groupName?: string };
export type ChannelMessageActionAdapter = Record<string, unknown>;
export type ChannelMessageActionContext = Record<string, unknown>;
export type ChannelMessageActionName = string;
export type ChannelMessageToolDiscovery = Record<string, unknown>;
export type ChannelMessageToolSchemaContribution = Record<string, unknown>;
export type ChannelStatusIssue = { code: string; message: string; severity: 'warn' | 'error' };
export type ChannelThreadingContext = Record<string, unknown>;
export type ChannelThreadingToolContext = Record<string, unknown>;
