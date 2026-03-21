/**
 * EnvEditor — 环境变量键值对编辑器（从 McpServerForm 提取）
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface EnvEntry { key: string; value: string }

export function parseEnvJson(json: string | null): EnvEntry[] {
  if (!json) return [];
  try { return Object.entries(JSON.parse(json)).map(([key, value]) => ({ key, value: String(value) })); }
  catch { return []; }
}

export function envToJson(entries: EnvEntry[]): string | null {
  const filtered = entries.filter(e => e.key.trim());
  if (filtered.length === 0) return null;
  return JSON.stringify(Object.fromEntries(filtered.map(e => [e.key, e.value])));
}

export function EnvEditor({ label, entries, onChange }: { label: string; entries: EnvEntry[]; onChange: (v: EnvEntry[]) => void }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-1">{label}</div>
      {entries.map((e, i) => (
        <div key={i} className="flex gap-2 mb-1">
          <Input value={e.key} onChange={ev => { const n = [...entries]; n[i] = { ...n[i], key: ev.target.value }; onChange(n); }} placeholder="KEY" className="flex-1 text-xs bg-background" />
          <Input value={e.value} onChange={ev => { const n = [...entries]; n[i] = { ...n[i], value: ev.target.value }; onChange(n); }} placeholder="VALUE" className="flex-1 text-xs bg-background" />
          <Button variant="ghost" size="icon-xs" onClick={() => onChange(entries.filter((_, j) => j !== i))} className="text-destructive">×</Button>
        </div>
      ))}
      <Button variant="ghost" size="xs" onClick={() => onChange([...entries, { key: '', value: '' }])}>+ 添加</Button>
    </div>
  );
}
