/**
 * CreateToolDialog.tsx — 新建 Tool Contract 轻向导弹窗
 *
 * V1 支持两种创建方式：
 * - 空白创建：从 0 定义 contract 和实现
 * - 从 Handler 创建：已有脚本处理器，快速补齐契约
 */
import { useState, useEffect, useMemo } from 'react';
import { mcpApi, type McpServer, type McpHandler } from './api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Loader2 } from 'lucide-react';
import { t, type Lang } from './i18n';

type CreateMode = 'blank' | 'handler';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string, initialStep: string) => void;
  lang?: Lang;
}

const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

const initialStepMap: Record<CreateMode, string> = {
  blank: 'input',
  handler: 'impl',
};

export function CreateToolDialog({ open, onOpenChange, onCreated, lang = 'zh' as Lang }: Props) {
  const T = t(lang);
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [createMode, setCreateMode] = useState<CreateMode>('blank');
  const [serverId, setServerId] = useState<string>('');
  const [handlerKey, setHandlerKey] = useState<string>('');

  // Reference data
  const [servers, setServers] = useState<McpServer[]>([]);
  const [handlers, setHandlers] = useState<McpHandler[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load servers + handlers when dialog opens
  useEffect(() => {
    if (!open) return;
    setDataLoading(true);
    Promise.all([
      mcpApi.listServers(),
      mcpApi.listHandlers(),
    ]).then(([s, h]) => {
      setServers(s.items);
      setHandlers(h.handlers);
    }).catch(console.error).finally(() => setDataLoading(false));
  }, [open]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setCreateMode('blank');
      setServerId('');
      setHandlerKey('');
      setError(null);
    }
  }, [open]);

  // When handler changes, auto-fill server and suggest name
  const selectedHandler = useMemo(
    () => handlers.find(h => h.key === handlerKey),
    [handlers, handlerKey],
  );

  useEffect(() => {
    if (createMode === 'handler' && selectedHandler) {
      setServerId(selectedHandler.server_id);
      if (!name) setName(selectedHandler.tool_name);
    }
  }, [selectedHandler, createMode]);

  // Filter handlers by selected server (if any)
  const filteredHandlers = useMemo(() => {
    if (createMode !== 'handler') return handlers;
    if (!serverId) return handlers;
    return handlers.filter(h => h.server_id === serverId);
  }, [handlers, serverId, createMode]);

  // Validation
  const nameError = useMemo(() => {
    if (!name) return null;
    if (!NAME_PATTERN.test(name)) return T.name_validate_err;
    return null;
  }, [name, T]);

  const canSubmit =
    name.trim().length > 0 &&
    !nameError &&
    !submitting &&
    (createMode !== 'handler' || handlerKey.length > 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        server_id: serverId || null,
        mocked: true,
        disabled: false,
      };

      if (createMode === 'handler') {
        // handler_key will be set via toolImplementations after creation
        payload._handler_key = handlerKey;
      }

      const res = await mcpApi.createTool(payload as any);
      onCreated(res.id, initialStepMap[createMode]);
      onOpenChange(false);
    } catch (err: any) {
      const msg = err.message ?? T.create_failed;
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{T.create_tool_title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* 创建方式 */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">{T.create_mode_label}</Label>
            <RadioGroup value={createMode} onValueChange={(v) => setCreateMode(v as CreateMode)} className="flex gap-3">
              <label className={`flex-1 flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors ${createMode === 'blank' ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}>
                <RadioGroupItem value="blank" className="mt-0.5" />
                <div>
                  <div className="text-xs font-medium">{T.create_blank}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{T.create_blank_desc}</div>
                </div>
              </label>
              <label className={`flex-1 flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors ${createMode === 'handler' ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}>
                <RadioGroupItem value="handler" className="mt-0.5" />
                <div>
                  <div className="text-xs font-medium">{T.create_from_handler}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{T.create_handler_desc}</div>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* 从 Handler 创建时：选择 Handler */}
          {createMode === 'handler' && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Handler <span className="text-destructive">*</span></Label>
              {dataLoading ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-2">
                  <Loader2 size={12} className="animate-spin" /> {T.loading}
                </div>
              ) : (
                <Select value={handlerKey} onValueChange={(v) => { if (v) setHandlerKey(v); }}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue placeholder={T.select_script_handler} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredHandlers.map(h => (
                      <SelectItem key={h.key} value={h.key}>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{h.tool_name}</span>
                          <Badge variant="outline" className="text-[9px]">{h.server_name}</Badge>
                        </div>
                      </SelectItem>
                    ))}
                    {filteredHandlers.length === 0 && (
                      <div className="px-2 py-3 text-xs text-muted-foreground text-center">{T.no_handlers}</div>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* 工具名 */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{T.tool_name_label} <span className="text-destructive">*</span></Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如 query_contract_detail"
              className="font-mono text-xs h-8"
              autoFocus
            />
            {nameError && (
              <p className="text-[10px] text-destructive flex items-center gap-1">
                <AlertCircle size={10} /> {nameError}
              </p>
            )}
          </div>

          {/* 描述 */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{T.description}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={T.desc_tool_ph}
              rows={2}
              className="text-xs resize-none"
            />
          </div>

          {/* 所属 Server */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{T.server_label}</Label>
            {dataLoading ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-2">
                <Loader2 size={12} className="animate-spin" /> {T.loading}
              </div>
            ) : (
              <Select
                value={serverId}
                onValueChange={(v) => { if (v) setServerId(v); }}
                disabled={createMode === 'handler' && !!selectedHandler}
              >
                <SelectTrigger className="text-xs h-8">
                  <SelectValue placeholder={T.server_select_hint} />
                </SelectTrigger>
                <SelectContent>
                  {servers.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
              <AlertCircle size={12} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 底部说明 */}
          <p className="text-[10px] text-muted-foreground">
            {T.create_post_hint}
          </p>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
              {T.cancel}
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
              {submitting && <Loader2 size={12} className="animate-spin mr-1" />}
              {T.create_enter_studio}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
