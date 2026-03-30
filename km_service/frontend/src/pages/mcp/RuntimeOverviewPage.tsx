/**
 * RuntimeOverviewPage.tsx — Tool Runtime 总览仪表盘
 *
 * 展示执行统计 + 服务来源。Server 管理从独立 tab 收归到此。
 */
import { memo, useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, CheckCircle, Clock, Layers, Settings, Plus, RefreshCw } from 'lucide-react';
import { fetchRuntimeStats, mcpApi, type RuntimeStats, type McpServer, type McpToolRecord } from './api';
import { ServerManageDialog } from './ServerManageDialog';
import { t, type Lang } from './i18n';

const EMPTY_STATS: RuntimeStats = {
  totalCalls: 0, successRate: 0, avgLatencyMs: 0,
  adapterDistribution: [], channelDistribution: [], topTools: [],
};

export const RuntimeOverviewPage = memo(function RuntimeOverviewPage({ lang = 'zh' as Lang }: { lang?: Lang }) {
  const T = t(lang);
  const [stats, setStats] = useState<RuntimeStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  // Server source data
  const [servers, setServers] = useState<McpServer[]>([]);
  const [toolCounts, setToolCounts] = useState<Map<string, number>>(new Map());
  const [dialogServer, setDialogServer] = useState<McpServer | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadServers = useCallback(() => {
    Promise.all([
      mcpApi.listServers(),
      mcpApi.listTools(),
    ]).then(([sRes, tRes]) => {
      setServers(sRes.items);
      const counts = new Map<string, number>();
      for (const t of tRes.items) {
        if (t.server_id) counts.set(t.server_id, (counts.get(t.server_id) ?? 0) + 1);
      }
      setToolCounts(counts);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    fetchRuntimeStats().then(setStats).catch(() => {}).finally(() => setLoading(false));
    loadServers();
  }, [loadServers]);

  if (loading) return <div className="p-6 text-xs text-muted-foreground">{T.loading_stats}</div>;

  const hasData = stats.totalCalls > 0;

  return (
    <div className="p-6 space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={<Activity size={16} />} label={T.total_calls} value={stats.totalCalls.toLocaleString()} />
        <StatCard icon={<CheckCircle size={16} />} label={T.success_rate} value={`${stats.successRate}%`}
          color={stats.successRate >= 95 ? 'text-green-600' : stats.successRate >= 80 ? 'text-yellow-600' : 'text-red-600'} />
        <StatCard icon={<Clock size={16} />} label={T.avg_latency} value={`${stats.avgLatencyMs}ms`} />
        <StatCard icon={<Layers size={16} />} label={T.adapters} value={String(stats.adapterDistribution.length)} />
      </div>

      {!hasData && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {T.no_exec_records_hint}
          </CardContent>
        </Card>
      )}

      {/* Server Sources */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{T.server_sources}</CardTitle>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={loadServers}>
                <RefreshCw size={11} /> {T.refresh}
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { setDialogServer(null); setCreating(true); setDialogOpen(true); }}>
                <Plus size={11} /> {T.add_server}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {servers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{T.no_servers}</p>
          ) : (
            <div className="space-y-1">
              {servers.map(s => {
                const isActive = s.kind !== 'planned' && s.enabled;
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer group"
                    onClick={() => { setDialogServer(s); setCreating(false); setDialogOpen(true); }}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-xs font-mono font-medium flex-1 min-w-0 truncate">{s.name}</span>
                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${
                      s.kind === 'internal' ? 'bg-sky-50 text-sky-700' :
                      s.kind === 'external' ? 'bg-orange-50 text-orange-700' :
                      'bg-gray-50 text-gray-500'
                    }`}>{s.kind}</Badge>
                    <span className="text-[11px] text-muted-foreground w-16">
                      {isActive ? T.running : s.kind === 'planned' ? T.planned : T.disabled}
                    </span>
                    <span className="text-[11px] text-muted-foreground w-14 text-right">
                      {toolCounts.get(s.id) ?? 0} {T.tools_suffix}
                    </span>
                    <Settings size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ServerManageDialog
        open={dialogOpen}
        server={creating ? null : dialogServer}
        onClose={() => { setDialogOpen(false); setDialogServer(null); setCreating(false); }}
        onSaved={() => { setDialogOpen(false); setDialogServer(null); setCreating(false); loadServers(); }}
        lang={lang}
      />

      {hasData && (
        <div className="grid grid-cols-2 gap-4">
          {/* Adapter Distribution */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{T.adapter_distribution}</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.adapterDistribution.map(d => (
                  <div key={d.adapter_type} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs">{d.adapter_type}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${(d.count / stats.totalCalls) * 100}%` }} />
                      </div>
                      <span className="text-muted-foreground text-xs w-10 text-right">{d.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Channel Distribution */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{T.channel_distribution}</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.channelDistribution.map(d => (
                  <div key={d.channel} className="flex items-center justify-between text-sm">
                    <Badge variant="outline" className="text-xs">{d.channel}</Badge>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${(d.count / stats.totalCalls) * 100}%` }} />
                      </div>
                      <span className="text-muted-foreground text-xs w-10 text-right">{d.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Tools */}
          <Card className="col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm">{T.top10_tools}</CardTitle></CardHeader>
            <CardContent>
              {stats.topTools.length === 0 ? (
                <p className="text-sm text-muted-foreground">{T.no_data}</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-4 text-xs font-medium text-muted-foreground pb-1 border-b">
                    <span>{T.col_tool}</span><span className="text-right">{T.col_calls}</span><span className="text-right">{T.col_success}</span><span className="text-right">{T.col_avg_latency}</span>
                  </div>
                  {stats.topTools.map(t => {
                    const rate = t.count > 0 ? Math.round((t.success_count / t.count) * 100) : 0;
                    return (
                      <div key={t.tool_name} className="grid grid-cols-4 text-xs py-1">
                        <span className="font-mono truncate">{t.tool_name}</span>
                        <span className="text-right">{t.count}</span>
                        <span className={`text-right ${rate >= 95 ? 'text-green-600' : rate >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>{rate}%</span>
                        <span className="text-right text-muted-foreground">{Math.round(t.avg_latency)}ms</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
});

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">{icon}{label}</div>
        <div className={`text-2xl font-semibold ${color ?? ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
