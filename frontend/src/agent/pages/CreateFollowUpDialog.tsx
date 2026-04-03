/**
 * CreateFollowUpDialog.tsx — Dialog for creating a follow-up work item
 * (ticket or callback) during an active interaction.
 */
import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { type Lang } from '../../i18n';

type FollowUpType = 'ticket' | 'callback' | 'appointment';

interface CreateFollowUpDialogProps {
  open: boolean;
  followUpType: FollowUpType;
  interactionId: string;
  lang: Lang;
  onClose: () => void;
}

const INTERACTION_PLATFORM_URL = '/ix-api';

const TYPE_LABELS: Record<FollowUpType, Record<Lang, string>> = {
  ticket: { zh: '创建工单', en: 'Create Ticket' },
  callback: { zh: '预约回呼', en: 'Schedule Callback' },
  appointment: { zh: '创建预约', en: 'Create Appointment' },
};

export const CreateFollowUpDialog = memo(function CreateFollowUpDialog({
  open,
  followUpType,
  interactionId,
  lang,
  onClose,
}: CreateFollowUpDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${INTERACTION_PLATFORM_URL}/api/interactions/${interactionId}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: followUpType,
          title: title.trim(),
          description: description.trim() || undefined,
          due_at: dueAt || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? (lang === 'zh' ? '创建失败' : 'Failed'));
        return;
      }
      setTitle('');
      setDescription('');
      setDueAt('');
      onClose();
    } catch {
      setError(lang === 'zh' ? '网络错误' : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const typeLabel = TYPE_LABELS[followUpType]?.[lang] ?? followUpType;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{typeLabel}</DialogTitle>
          <DialogDescription>
            {lang === 'zh' ? '填写以下信息创建后续任务' : 'Fill in the details to create a follow-up'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{lang === 'zh' ? '标题' : 'Title'}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={lang === 'zh' ? '简要描述问题' : 'Brief description'}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{lang === 'zh' ? '描述' : 'Description'}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={lang === 'zh' ? '详细说明...' : 'Details...'}
            />
          </div>

          {(followUpType === 'callback' || followUpType === 'appointment') && (
            <div className="space-y-1.5">
              <Label>{lang === 'zh' ? '预约时间' : 'Scheduled Time'}</Label>
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {lang === 'zh' ? '取消' : 'Cancel'}
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || submitting}>
            {submitting
              ? (lang === 'zh' ? '创建中...' : 'Creating...')
              : (lang === 'zh' ? '确认创建' : 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
