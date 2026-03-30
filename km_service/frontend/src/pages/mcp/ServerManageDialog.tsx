/**
 * ServerManageDialog — 轻量 Server 编辑 Dialog（替代旧 McpServerConsole）
 *
 * - Internal: 只读 name/transport/url，可改 description/enabled，可 Discover
 * - External/Planned: 可改 name/description/url/kind/enabled，可 Discover/Delete
 * - null server: 新建模式
 */
import { useState, useEffect } from 'react';
import { mcpApi, type McpServer } from './api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Trash2, Save } from 'lucide-react';
import { t, tpl, type Lang } from './i18n';

interface Props {
  open: boolean;
  server: McpServer | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
  lang?: Lang;
}

export function ServerManageDialog({ open, server, onClose, onSaved, lang = 'zh' as Lang }: Props) {
  const T = t(lang);
  const isCreate = !server;
  const isInternal = server?.kind === 'internal';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<'internal' | 'external' | 'planned'>('external');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(server?.name ?? '');
      setDescription(server?.description ?? '');
      setUrl(server?.url ?? '');
      setKind(server?.kind ?? 'external');
      setEnabled(server?.enabled ?? true);
      setDiscoverResult(null);
    }
  }, [open, server]);

  const handleSave = async () => {
    if (!name.trim()) return alert(T.name_required);
    setSaving(true);
    try {
      if (isCreate) {
        await mcpApi.createServer({ name: name.trim(), description, url: url || undefined, kind, enabled });
      } else if (isInternal) {
        await mcpApi.updateServer(server.id, { description, enabled });
      } else {
        await mcpApi.updateServer(server!.id, { name: name.trim(), description, url: url || undefined, kind, enabled });
      }
      onSaved();
    } catch (e) {
      alert(`${T.save_failed} ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscover = async () => {
    if (!server) return;
    setDiscovering(true);
    setDiscoverResult(null);
    try {
      const res = await mcpApi.discoverTools(server.id);
      setDiscoverResult(tpl(T.discovered_tools, { n: res.tools.length }));
    } catch (e) {
      setDiscoverResult(`Failed: ${e}`);
    } finally {
      setDiscovering(false);
    }
  };

  const handleDelete = async () => {
    if (!server) return;
    if (!confirm(tpl(T.confirm_delete_server, { name: server.name }))) return;
    try {
      await mcpApi.deleteServer(server.id);
      onSaved();
    } catch (e) {
      alert(`${T.delete_failed} ${e}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            {isCreate ? T.add_server : server.name}
            {server && (
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${
                server.kind === 'internal' ? 'bg-sky-50 text-sky-700' :
                server.kind === 'external' ? 'bg-orange-50 text-orange-700' :
                'bg-gray-50 text-gray-500'
              }`}>{server.kind}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          {/* Name */}
          <div>
            <Label className="text-xs">{T.name}</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={isInternal}
              className="text-xs font-mono h-8 mt-1"
              placeholder="my-service"
            />
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs">{T.description}</Label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="text-xs h-8 mt-1"
              placeholder={T.desc_placeholder}
            />
          </div>

          {/* URL */}
          <div>
            <Label className="text-xs">{T.url}</Label>
            <Input
              value={url}
              onChange={e => setUrl(e.target.value)}
              disabled={isInternal}
              className="text-xs font-mono h-8 mt-1"
              placeholder="http://localhost:18003/mcp"
            />
          </div>

          {/* Kind + Enabled */}
          <div className="flex gap-3">
            <div className="flex-1">
              <Label className="text-xs">{T.kind}</Label>
              <Select value={kind} onValueChange={v => setKind(v as typeof kind)} disabled={isInternal}>
                <SelectTrigger className="text-xs h-8 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">{T.internal}</SelectItem>
                  <SelectItem value="external">{T.external}</SelectItem>
                  <SelectItem value="planned">{T.planned}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs">{T.enabled}</Label>
              <Select value={enabled ? 'true' : 'false'} onValueChange={v => setEnabled(v === 'true')}>
                <SelectTrigger className="text-xs h-8 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">{T.yes}</SelectItem>
                  <SelectItem value="false">{T.no}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Last connected */}
          {server?.last_connected_at && (
            <p className="text-[11px] text-muted-foreground">
              {T.last_connected} {new Date(server.last_connected_at).toLocaleString()}
            </p>
          )}

          {/* Discover result */}
          {discoverResult && (
            <p className={`text-[11px] ${discoverResult.startsWith('Failed') ? 'text-red-500' : 'text-green-600'}`}>
              {discoverResult}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t mt-2">
          <div className="flex gap-2">
            {server && !isInternal && (
              <Button variant="ghost" size="sm" className="text-xs text-red-500 hover:text-red-600 h-7" onClick={handleDelete}>
                <Trash2 size={12} /> {T.delete}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {server && server.kind !== 'planned' && (
              <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={handleDiscover} disabled={discovering}>
                <RefreshCw size={11} className={discovering ? 'animate-spin' : ''} />
                {discovering ? T.discovering : T.discover_tools}
              </Button>
            )}
            <Button size="sm" className="text-xs h-7 gap-1" onClick={handleSave} disabled={saving}>
              <Save size={11} /> {saving ? T.saving : T.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
