/**
 * LifecyclePage.tsx — 生命周期管理
 *
 * 阶段漏斗可视化 + 阶段列表 + 规则配置
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAgentContext } from '../../AgentContext';
import { fetchLifecycleStages, type LifecycleStage } from '../api';

export const LifecyclePage = memo(function LifecyclePage() {
  const { lang } = useAgentContext();
  const [stages, setStages] = useState<LifecycleStage[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchLifecycleStages();
      setStages(res.items);
    } catch (err) {
      console.error('Failed to load lifecycle stages:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalParties = stages.reduce((sum, s) => sum + s.party_count, 0);

  return (
    <div className="h-full overflow-auto p-4">
      {loading && stages.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{lang === 'zh' ? '加载中...' : 'Loading...'}</p>
      ) : stages.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{lang === 'zh' ? '暂无生命周期配置' : 'No lifecycle stages'}</p>
      ) : (
        <>
          {/* Funnel visualization */}
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{lang === 'zh' ? '生命周期漏斗' : 'Lifecycle Funnel'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-32">
                {stages.map((stage) => {
                  const pct = totalParties > 0 ? Math.max((stage.party_count / totalParties) * 100, 5) : 20;
                  return (
                    <div key={stage.stage_id} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs font-medium tabular-nums">{stage.party_count}</span>
                      <div
                        className="w-full rounded-t transition-all"
                        style={{
                          height: `${pct}%`,
                          backgroundColor: stage.color ?? '#94a3b8',
                          minHeight: '8px',
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground text-center">{stage.stage_name}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Stage list */}
          <div className="space-y-2">
            {stages.map((stage) => (
              <Card key={stage.stage_id}>
                <CardContent className="py-3 px-4 flex items-center gap-4">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stage.color ?? '#94a3b8' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{stage.stage_name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {lang === 'zh' ? `第 ${stage.stage_order} 阶段` : `Stage ${stage.stage_order}`}
                      </Badge>
                      <Badge variant={stage.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                        {stage.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{stage.description ?? '-'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-semibold tabular-nums">{stage.party_count}</div>
                    <div className="text-[10px] text-muted-foreground">{lang === 'zh' ? '人' : 'customers'}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
