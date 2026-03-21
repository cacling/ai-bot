/**
 * IdentityModule — Server 基本信息编辑（仅身份字段）
 */
import { useState } from 'react';
import { Save } from 'lucide-react';
import { mcpApi, type McpServer } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  server: McpServer;
  onSaved: () => void;
}

export function IdentityModule({ server, onSaved }: Props) {
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description);
  const [status, setStatus] = useState<'active' | 'planned'>(server.status as 'active' | 'planned');
  const [saving, setSaving] = useState(false);

  const hasChanges = name !== server.name || description !== server.description || status !== server.status;

  const handleSave = async () => {
    if (!name.trim()) return alert('名称不能为空');
    setSaving(true);
    try {
      await mcpApi.updateServer(server.id, { name: name.trim(), description, status });
      onSaved();
    } catch (e) {
      alert(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">基本信息</h3>
        <Button size="sm" onClick={handleSave} disabled={saving || !hasChanges}>
          <Save size={12} /> {saving ? '保存中...' : '保存'}
        </Button>
      </div>

      <div className="max-w-lg space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">名称</label>
          <Input value={name} onChange={e => setName(e.target.value)} className="text-xs font-mono" placeholder="my-service" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">描述</label>
          <Input value={description} onChange={e => setDescription(e.target.value)} className="text-xs" placeholder="服务描述" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">状态</label>
          <Select value={status} onValueChange={(v) => v && setStatus(v as 'active' | 'planned')}>
            <SelectTrigger className="w-48 text-xs h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active（可连接）</SelectItem>
              <SelectItem value="planned">Planned（规划中）</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-muted-foreground pt-2">
          Server 表示能力分组 / 运行后端。连接配置（URL、Headers、环境变量等）在「资源」中管理。
        </p>
      </div>
    </div>
  );
}
