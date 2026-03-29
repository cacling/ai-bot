import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { kmApi, type KMAuditLog } from './api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export function AuditLogPage() {
  const [items, setItems] = useState<KMAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    kmApi.listAuditLogs().then(r => setItems(r.items)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">审计日志</h2>
        <Button variant="ghost" size="icon-sm" onClick={load}><RefreshCw size={14} /></Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>动作</TableHead>
              <TableHead>对象类型</TableHead>
              <TableHead>对象 ID</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead>风险</TableHead>
              <TableHead>时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">暂无日志</TableCell></TableRow>
            ) : items.map(l => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.action}</TableCell>
                <TableCell className="text-muted-foreground">{l.object_type}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-[10px]">{l.object_id.slice(0, 12)}</TableCell>
                <TableCell className="text-muted-foreground">{l.operator}</TableCell>
                <TableCell>
                  {l.risk_level && <Badge variant={l.risk_level === 'high' ? 'destructive' : 'secondary'}>{l.risk_level}</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">{l.created_at?.slice(0, 19).replace('T', ' ')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
