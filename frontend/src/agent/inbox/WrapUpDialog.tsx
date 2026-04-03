/**
 * WrapUpDialog.tsx — Wrap-up + optional follow-up dialog.
 *
 * Shown when an agent wants to close an interaction.
 * Allows selecting wrap-up code, adding notes, and optionally
 * creating a follow-up work item (ticket, callback, appointment).
 */
import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { type Lang } from '../../i18n';

interface WrapUpDialogProps {
  open: boolean;
  interactionId: string;
  lang: Lang;
  onClose: () => void;
  onSubmit: (data: WrapUpData) => void;
}

export interface WrapUpData {
  wrap_up_code: string;
  wrap_up_note: string;
  follow_up?: {
    type: 'callback' | 'ticket' | 'appointment';
    title: string;
    description?: string;
    due_at?: string;
  };
}

const WRAP_UP_CODES: { value: string; zh: string; en: string }[] = [
  { value: 'resolved', zh: '已解决', en: 'Resolved' },
  { value: 'follow_up_needed', zh: '需跟进', en: 'Follow-up Needed' },
  { value: 'escalated', zh: '已升级', en: 'Escalated' },
  { value: 'no_action', zh: '无需处理', en: 'No Action' },
];

const FOLLOW_UP_TYPES: { value: string; zh: string; en: string }[] = [
  { value: 'ticket', zh: '工单', en: 'Ticket' },
  { value: 'callback', zh: '回呼', en: 'Callback' },
  { value: 'appointment', zh: '预约', en: 'Appointment' },
];

const IX_API_BASE = '/ix-api';

export const WrapUpDialog = memo(function WrapUpDialog({
  open,
  interactionId,
  lang,
  onClose,
  onSubmit,
}: WrapUpDialogProps) {
  const [code, setCode] = useState('resolved');
  const [note, setNote] = useState('');
  const [hasFollowUp, setHasFollowUp] = useState(false);
  const [followUpType, setFollowUpType] = useState('ticket');
  const [followUpTitle, setFollowUpTitle] = useState('');
  const [followUpDesc, setFollowUpDesc] = useState('');
  const [followUpDue, setFollowUpDue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const data: WrapUpData = {
        wrap_up_code: code,
        wrap_up_note: note,
      };
      if (hasFollowUp && followUpTitle.trim()) {
        data.follow_up = {
          type: followUpType as 'callback' | 'ticket' | 'appointment',
          title: followUpTitle.trim(),
          description: followUpDesc.trim() || undefined,
          due_at: followUpDue || undefined,
        };
      }

      const res = await fetch(`${IX_API_BASE}/api/interactions/${interactionId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }

      onSubmit(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lang === 'zh' ? '结束会话' : 'Close Interaction'}</DialogTitle>
          <DialogDescription>
            {lang === 'zh'
              ? '选择结果并添加备注。可选创建后续工单。'
              : 'Select outcome and add notes. Optionally create a follow-up.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Wrap-up code */}
          <div className="space-y-1.5">
            <Label>{lang === 'zh' ? '处理结果' : 'Outcome'}</Label>
            <Select value={code} onValueChange={(v) => v && setCode(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WRAP_UP_CODES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c[lang]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label>{lang === 'zh' ? '备注' : 'Notes'}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={lang === 'zh' ? '添加处理备注...' : 'Add wrap-up notes...'}
              rows={3}
            />
          </div>

          {/* Follow-up toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="follow-up-toggle"
              checked={hasFollowUp}
              onCheckedChange={(v) => setHasFollowUp(!!v)}
            />
            <Label htmlFor="follow-up-toggle" className="cursor-pointer">
              {lang === 'zh' ? '创建后续工单' : 'Create follow-up'}
            </Label>
          </div>

          {/* Follow-up fields */}
          {hasFollowUp && (
            <div className="space-y-3 border-l-2 border-border pl-3">
              <div className="space-y-1.5">
                <Label>{lang === 'zh' ? '类型' : 'Type'}</Label>
                <Select value={followUpType} onValueChange={(v) => v && setFollowUpType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLLOW_UP_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t[lang]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{lang === 'zh' ? '标题' : 'Title'}</Label>
                <Input
                  value={followUpTitle}
                  onChange={(e) => setFollowUpTitle(e.target.value)}
                  placeholder={lang === 'zh' ? '工单标题' : 'Work item title'}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{lang === 'zh' ? '描述' : 'Description'}</Label>
                <Textarea
                  value={followUpDesc}
                  onChange={(e) => setFollowUpDesc(e.target.value)}
                  rows={2}
                  placeholder={lang === 'zh' ? '详细描述...' : 'Details...'}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{lang === 'zh' ? '截止时间' : 'Due date'}</Label>
                <Input
                  type="datetime-local"
                  value={followUpDue}
                  onChange={(e) => setFollowUpDue(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive">{lang === 'zh' ? '操作失败：' : 'Error: '}{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{lang === 'zh' ? '取消' : 'Cancel'}</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? (lang === 'zh' ? '提交中...' : 'Submitting...')
              : (lang === 'zh' ? '确认关闭' : 'Close Interaction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
