/**
 * RuntimeOverviewPage.tsx — Tool Runtime 总览仪表盘
 *
 * 展示执行统计：总调用量、成功率、平均延迟、适配器分布、Top 工具
 */
import { memo, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, CheckCircle, Clock, Layers } from 'lucide-react';
import { fetchRuntimeStats, type RuntimeStats } from './api';

const EMPTY_STATS: RuntimeStats = {
  totalCalls: 0, successRate: 0, avgLatencyMs: 0,
  adapterDistribution: [], channelDistribution: [], topTools: [],
};

export const RuntimeOverviewPage = memo(function RuntimeOverviewPage() {
  const [stats, setStats] = useState<RuntimeStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRuntimeStats().then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-xs text-muted-foreground">Loading stats...</div>;

  const hasData = stats.totalCalls > 0;

  return (
    <div className="p-6 space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={<Activity size={16} />} label="Total Calls" value={stats.totalCalls.toLocaleString()} />
        <StatCard icon={<CheckCircle size={16} />} label="Success Rate" value={`${stats.successRate}%`}
          color={stats.successRate >= 95 ? 'text-green-600' : stats.successRate >= 80 ? 'text-yellow-600' : 'text-red-600'} />
        <StatCard icon={<Clock size={16} />} label="Avg Latency" value={`${stats.avgLatencyMs}ms`} />
        <StatCard icon={<Layers size={16} />} label="Adapters" value={String(stats.adapterDistribution.length)} />
      </div>

      {!hasData && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No execution records yet. Enable <code className="px-1 py-0.5 bg-muted rounded text-xs">TOOL_RUNTIME_ENABLED=true</code> to start collecting data.
          </CardContent>
        </Card>
      )}

      {hasData && (
        <div className="grid grid-cols-2 gap-4">
          {/* Adapter Distribution */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Adapter Distribution</CardTitle></CardHeader>
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
            <CardHeader className="pb-2"><CardTitle className="text-sm">Channel Distribution</CardTitle></CardHeader>
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
            <CardHeader className="pb-2"><CardTitle className="text-sm">Top 10 Tools</CardTitle></CardHeader>
            <CardContent>
              {stats.topTools.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-4 text-xs font-medium text-muted-foreground pb-1 border-b">
                    <span>Tool</span><span className="text-right">Calls</span><span className="text-right">Success</span><span className="text-right">Avg Latency</span>
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
