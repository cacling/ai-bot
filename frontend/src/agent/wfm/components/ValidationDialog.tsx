/**
 * ValidationDialog.tsx — 编辑校验结果对话框
 *
 * 显示 errors（红色，阻塞）、warnings（黄色，可确认覆盖）。
 */
import { memo } from 'react';
import { type Lang } from '../../../i18n';

export interface ValidationItem {
  level: 'error' | 'warning' | 'info';
  ruleCode: string;
  message: string;
}

interface ValidationDialogProps {
  lang: Lang;
  errors: ValidationItem[];
  warnings: ValidationItem[];
  onClose: () => void;
  onConfirmWarnings?: () => void;
}

const LEVEL_STYLE: Record<string, string> = {
  error: 'bg-red-50 text-red-700 border-red-200',
  warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
};

export const ValidationDialog = memo(function ValidationDialog({
  lang, errors, warnings, onClose, onConfirmWarnings,
}: ValidationDialogProps) {
  const hasOnlyWarnings = errors.length === 0 && warnings.length > 0;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg shadow-lg w-[420px] max-h-[80vh] flex flex-col">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">
            {lang === 'zh' ? '校验结果' : 'Validation Results'}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {errors.map((item, i) => (
            <div key={`e-${i}`} className={`px-3 py-2 text-xs rounded border ${LEVEL_STYLE.error}`}>
              <span className="font-medium">[{item.ruleCode}]</span> {item.message}
            </div>
          ))}
          {warnings.map((item, i) => (
            <div key={`w-${i}`} className={`px-3 py-2 text-xs rounded border ${LEVEL_STYLE.warning}`}>
              <span className="font-medium">[{item.ruleCode}]</span> {item.message}
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          {hasOnlyWarnings && onConfirmWarnings && (
            <button
              onClick={onConfirmWarnings}
              className="px-3 py-1.5 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600"
            >
              {lang === 'zh' ? '忽略警告并保存' : 'Accept Warnings & Save'}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent"
          >
            {lang === 'zh' ? '关闭' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
});
