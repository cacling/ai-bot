/**
 * TransferQueueDialog.tsx — Dialog for transferring an interaction to another queue.
 */
import { memo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { type Lang } from '../../i18n';
import { useQueues } from '../hooks/useQueues';

interface TransferQueueDialogProps {
  open: boolean;
  lang: Lang;
  onClose: () => void;
  onTransfer: (targetQueue: string) => void;
}

export const TransferQueueDialog = memo(function TransferQueueDialog({
  open,
  lang,
  onClose,
  onTransfer,
}: TransferQueueDialogProps) {
  const queues = useQueues();
  const [selectedQueue, setSelectedQueue] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedQueue('');
  }, [open]);

  const handleTransfer = () => {
    if (!selectedQueue) return;
    setLoading(true);
    onTransfer(selectedQueue);
    setLoading(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{lang === 'zh' ? '转接队列' : 'Transfer to Queue'}</DialogTitle>
          <DialogDescription>
            {lang === 'zh' ? '选择目标队列进行转接' : 'Select a target queue for transfer'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Label>{lang === 'zh' ? '目标队列' : 'Target Queue'}</Label>
          <Select value={selectedQueue} onValueChange={setSelectedQueue}>
            <SelectTrigger>
              <SelectValue placeholder={lang === 'zh' ? '请选择队列' : 'Select queue'} />
            </SelectTrigger>
            <SelectContent>
              {queues.map((q) => (
                <SelectItem key={q.queue_code} value={q.queue_code}>
                  {lang === 'zh' ? q.display_name_zh : q.display_name_en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {lang === 'zh' ? '取消' : 'Cancel'}
          </Button>
          <Button onClick={handleTransfer} disabled={!selectedQueue || loading}>
            {loading
              ? (lang === 'zh' ? '转接中...' : 'Transferring...')
              : (lang === 'zh' ? '确认转接' : 'Transfer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
