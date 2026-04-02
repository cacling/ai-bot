/**
 * RoutingControlPage.tsx — Queue routing configuration + shadow comparison + replay.
 *
 * Shows routing queues, their plugin bindings, and allows testing via
 * shadow routing comparison and historical replay.
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { type Lang } from '../../i18n';
import { useAgentContext } from '../AgentContext';

const INTERACTION_PLATFORM_URL = '/ix-api';

interface RoutingQueue {
  queue_code: string;
  display_name_zh: string;
  display_name_en: string;
  domain_scope: string;
  work_model: string;
  priority: number;
  max_wait_seconds: number | null;
  overflow_queue: string | null;
  status: string;
}

interface PluginBinding {
  binding_id: string;
  queue_code: string;
  plugin_id: string;
  slot: string;
  priority_order: number;
  enabled: boolean;
  shadow_mode: boolean;
  config_override_json: string | null;
}

interface ReplayResult {
  interaction_id: string;
  original: {
    assigned_agent_id?: string | null;
    queue_code?: string | null;
    state: string;
  };
  replayed: {
    would_assign?: string;
    queue_selector_result?: { queue_code: string; reason?: string };
  };
  divergence: boolean;
  divergence_summary?: string;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${INTERACTION_PLATFORM_URL}${path}`, init);
  return res.json() as Promise<T>;
}

const SLOT_LABELS: Record<string, Record<Lang, string>> = {
  queue_selector: { zh: '队列选择', en: 'Queue Selector' },
  candidate_scorer: { zh: '候选评分', en: 'Candidate Scorer' },
  offer_strategy: { zh: '分配策略', en: 'Offer Strategy' },
  overflow_policy: { zh: '溢出策略', en: 'Overflow Policy' },
};

export const RoutingControlPage = memo(function RoutingControlPage() {
  const { lang } = useAgentContext();
  const [queues, setQueues] = useState<RoutingQueue[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [bindings, setBindings] = useState<PluginBinding[]>([]);
  const [replayId, setReplayId] = useState('');
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);

  // Load queues
  useEffect(() => {
    fetchJson<{ items: RoutingQueue[] }>('/api/queues').then(r => {
      setQueues(r.items);
      if (r.items.length > 0 && !selectedQueue) setSelectedQueue(r.items[0].queue_code);
    }).catch(console.error);
  }, []);

  // Load bindings for selected queue
  useEffect(() => {
    if (!selectedQueue) return;
    fetchJson<{ items: PluginBinding[] }>(`/api/plugins/bindings?queue_code=${selectedQueue}`)
      .then(r => setBindings(r.items))
      .catch(console.error);
  }, [selectedQueue]);

  const handleReplay = useCallback(async () => {
    if (!replayId.trim()) return;
    setReplayLoading(true);
    try {
      const result = await fetchJson<ReplayResult>('/api/plugins/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interaction_id: replayId.trim() }),
      });
      setReplayResult(result);
    } catch (err) {
      console.error(err);
    } finally {
      setReplayLoading(false);
    }
  }, [replayId]);

  const selectedQueueData = queues.find(q => q.queue_code === selectedQueue);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-lg font-semibold">
          {lang === 'zh' ? '路由控制台' : 'Routing Console'}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {lang === 'zh' ? '管理路由队列配置、插件绑定和路由决策回放' : 'Manage routing queues, plugin bindings, and replay routing decisions'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Queue list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {lang === 'zh' ? '路由队列' : 'Routing Queues'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-3 pt-0">
            {queues.map(q => (
              <Button
                key={q.queue_code}
                variant={selectedQueue === q.queue_code ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setSelectedQueue(q.queue_code)}
                className="w-full justify-between h-auto py-2"
              >
                <div className="text-left">
                  <div className="text-sm font-medium">
                    {lang === 'zh' ? q.display_name_zh : q.display_name_en}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{q.queue_code}</div>
                </div>
                <Badge variant={q.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                  {q.status}
                </Badge>
              </Button>
            ))}
            {queues.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {lang === 'zh' ? '暂无队列' : 'No queues'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Queue detail + bindings */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {selectedQueueData
                ? (lang === 'zh' ? selectedQueueData.display_name_zh : selectedQueueData.display_name_en)
                : (lang === 'zh' ? '选择队列' : 'Select Queue')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedQueueData && (
              <>
                {/* Queue info */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">{lang === 'zh' ? '工作模型' : 'Work Model'}:</span>
                    <span className="ml-1">{selectedQueueData.work_model}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{lang === 'zh' ? '优先级' : 'Priority'}:</span>
                    <span className="ml-1">{selectedQueueData.priority}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{lang === 'zh' ? '最大等待' : 'Max Wait'}:</span>
                    <span className="ml-1">{selectedQueueData.max_wait_seconds ?? '-'}s</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{lang === 'zh' ? '溢出队列' : 'Overflow'}:</span>
                    <span className="ml-1">{selectedQueueData.overflow_queue ?? '-'}</span>
                  </div>
                </div>

                <Separator />

                {/* Plugin bindings by slot */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {lang === 'zh' ? '插件绑定' : 'Plugin Bindings'}
                  </h4>

                  {Object.entries(SLOT_LABELS).map(([slot, labels]) => {
                    const slotBindings = bindings.filter(b => b.slot === slot);
                    return (
                      <div key={slot} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium">{labels[lang]}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {slotBindings.length} {lang === 'zh' ? '个插件' : 'plugins'}
                          </Badge>
                        </div>
                        {slotBindings.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">
                            {lang === 'zh' ? '使用核心默认逻辑' : 'Using core default logic'}
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {slotBindings.map(b => (
                              <div key={b.binding_id} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1.5">
                                <span>{b.plugin_id.slice(0, 8)}</span>
                                <div className="flex gap-1">
                                  {b.shadow_mode && (
                                    <Badge variant="outline" className="text-[9px] px-1">shadow</Badge>
                                  )}
                                  <Badge variant={b.enabled ? 'default' : 'secondary'} className="text-[9px] px-1">
                                    {b.enabled ? (lang === 'zh' ? '启用' : 'on') : (lang === 'zh' ? '禁用' : 'off')}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Replay section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            {lang === 'zh' ? '路由决策回放' : 'Routing Replay'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">
                {lang === 'zh' ? 'Interaction ID' : 'Interaction ID'}
              </label>
              <Input
                value={replayId}
                onChange={e => setReplayId(e.target.value)}
                placeholder="interaction-uuid..."
                className="h-8 text-sm"
              />
            </div>
            <Button size="sm" onClick={handleReplay} disabled={replayLoading || !replayId.trim()}>
              {replayLoading
                ? (lang === 'zh' ? '回放中...' : 'Replaying...')
                : (lang === 'zh' ? '回放' : 'Replay')}
            </Button>
          </div>

          {replayResult && (
            <div className="border rounded-lg p-3 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-medium">{lang === 'zh' ? '结果' : 'Result'}:</span>
                <Badge variant={replayResult.divergence ? 'destructive' : 'default'} className="text-[10px]">
                  {replayResult.divergence
                    ? (lang === 'zh' ? '有分歧' : 'Divergent')
                    : (lang === 'zh' ? '一致' : 'Consistent')}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground">{lang === 'zh' ? '原始分配' : 'Original'}:</span>
                  <span className="ml-1">{replayResult.original.assigned_agent_id ?? 'none'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{lang === 'zh' ? '回放分配' : 'Replayed'}:</span>
                  <span className="ml-1">{replayResult.replayed.would_assign ?? 'none'}</span>
                </div>
              </div>
              {replayResult.divergence_summary && (
                <p className="text-muted-foreground">{replayResult.divergence_summary}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});
