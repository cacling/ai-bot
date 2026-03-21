/**
 * McpToolEditor.tsx — MCP 工具编辑弹窗（新架构）
 *
 * 3 个 Tab：基本信息 / Mock 规则 / 测试
 */
import React, { useState, useEffect } from 'react';
import { Save, X, Plus, Trash2, Info, Database, FlaskConical } from 'lucide-react';
import { mcpApi, type McpToolRecord, type McpServer, type MockRule } from './api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  toolId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export function McpToolEditor({ toolId, onClose, onUpdated }: Props) {
  const [tool, setTool] = useState<McpToolRecord | null>(null);
  const [servers, setServers] = useState<McpServer[]>([]);

  useEffect(() => {
    Promise.all([
      mcpApi.getTool(toolId),
      mcpApi.listServers(),
    ]).then(([t, s]) => {
      setTool(t);
      setServers(s.items);
    }).catch(console.error);
  }, [toolId]);

  if (!tool) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[860px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <DialogTitle className="text-sm font-semibold font-mono">{tool.name}</DialogTitle>
          <div className="text-[11px] text-muted-foreground">
            Server: {servers.find(s => s.id === tool.server_id)?.name ?? '未分配'}
            {tool.skills && tool.skills.length > 0 && (
              <span className="ml-2">· Skill: {tool.skills.join(', ')}</span>
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="info" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0">
            <TabsTrigger value="info" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none gap-1.5 text-xs">
              <Info size={12} /> 基本信息
            </TabsTrigger>
            <TabsTrigger value="mock" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none gap-1.5 text-xs">
              <Database size={12} /> Mock 规则
            </TabsTrigger>
            <TabsTrigger value="test" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none gap-1.5 text-xs">
              <FlaskConical size={12} /> 测试
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="flex-1 overflow-auto mt-0 p-6">
            <InfoTab tool={tool} servers={servers} onUpdated={() => { mcpApi.getTool(toolId).then(setTool); onUpdated?.(); }} />
          </TabsContent>
          <TabsContent value="mock" className="flex-1 overflow-auto mt-0 p-6">
            <MockTab tool={tool} onUpdated={() => { mcpApi.getTool(toolId).then(setTool); onUpdated?.(); }} />
          </TabsContent>
          <TabsContent value="test" className="flex-1 overflow-auto mt-0 p-6">
            <TestTab tool={tool} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── Info Tab ─────────────────────────────────────────────────────────────────

function InfoTab({ tool, servers, onUpdated }: { tool: McpToolRecord; servers: McpServer[]; onUpdated: () => void }) {
  const [name, setName] = useState(tool.name);
  const [description, setDescription] = useState(tool.description);
  const [serverId, setServerId] = useState(tool.server_id ?? '' as string);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await mcpApi.updateTool(tool.id, { name, description, server_id: serverId || undefined } as any);
      onUpdated();
    } catch (e) { alert(`保存失败: ${e}`); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">工具名</label>
          <Input value={name} onChange={e => setName(e.target.value)} className="text-xs font-mono" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">所属 Server</label>
          <Select value={serverId} onValueChange={v => { if (v) setServerId(v); }}>
            <SelectTrigger className="text-xs h-8">
              <SelectValue placeholder="选择 Server">{servers.find(s => s.id === serverId)?.name ?? serverId}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {servers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">描述</label>
        <Input value={description} onChange={e => setDescription(e.target.value)} className="text-xs" />
      </div>

      {tool.skills && tool.skills.length > 0 && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">关联 Skill</label>
          <div className="flex gap-1.5">{tool.skills.map(s => <Badge key={s} variant="secondary">{s}</Badge>)}</div>
        </div>
      )}

      <div className="pt-2 border-t">
        <Button size="sm" onClick={handleSave} disabled={saving}><Save size={12} /> {saving ? '保存中...' : '保存'}</Button>
      </div>
    </div>
  );
}

// ── Execution Config Tab ─────────────────────────────────────────────────────

// ── Mock Tab ─────────────────────────────────────────────────────────────────

function MockTab({ tool, onUpdated }: { tool: McpToolRecord; onUpdated: () => void }) {
  const [rules, setRules] = useState<MockRule[]>(tool.mock_rules ? JSON.parse(tool.mock_rules) : []);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await mcpApi.updateToolMockRules(tool.id, rules);
      onUpdated();
    } catch (e) { alert(`保存失败: ${e}`); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">为 <span className="font-mono">{tool.name}</span> 定义 Mock 返回规则。</p>
        <Button size="xs" onClick={handleSave} disabled={saving}><Save size={11} /> {saving ? '保存中...' : '保存'}</Button>
      </div>

      {rules.map((rule, i) => (
        <div key={i} className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">规则 {i + 1}{!rule.match ? ' (默认兜底)' : ''}</span>
            <Button variant="ghost" size="icon-xs" className="text-destructive" onClick={() => setRules(rules.filter((_, j) => j !== i))}><Trash2 size={12} /></Button>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-0.5">匹配条件 <span className="opacity-50">(留空=默认)</span></div>
            <Input value={rule.match} onChange={e => { const n = [...rules]; n[i] = { ...n[i], match: e.target.value }; setRules(n); }} placeholder='phone == "13800000001"' className="text-[11px] font-mono" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-0.5">返回数据 (JSON)</div>
            <Textarea value={rule.response} onChange={e => { const n = [...rules]; n[i] = { ...n[i], response: e.target.value }; setRules(n); }} className="h-20 text-[11px] font-mono resize-none" />
          </div>
        </div>
      ))}

      <Button variant="ghost" size="sm" onClick={() => setRules([...rules, { tool_name: tool.name, match: '', response: '{}' }])}>
        <Plus size={12} /> 添加规则
      </Button>
    </div>
  );
}

// ── Test Tab ─────────────────────────────────────────────────────────────────

function TestTab({ tool }: { tool: McpToolRecord }) {
  const cfg = tool.execution_config ? JSON.parse(tool.execution_config) as { impl_type?: string } : null;

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-muted-foreground space-y-1">
        <div>模式: <span className="font-medium text-foreground">{tool.mocked ? 'Mock' : 'Real'}</span></div>
        <div>Real 实现: <span className="font-medium text-foreground">{cfg?.impl_type ?? '未配置'}</span></div>
      </div>
      <p className="text-xs text-muted-foreground italic">测试功能开发中，请使用技能管理的测试面板进行集成测试。</p>
    </div>
  );
}
