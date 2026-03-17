/**
 * UserDetailContent.tsx — current user profile card (colSpan: 1)
 *
 * data shape: MockUser | null
 */

import { memo } from 'react';
import { User } from 'lucide-react';
import type { Lang } from '../../../i18n';
import type { MockUser } from '../../../mockUsers';

export const UserDetailContent = memo(function UserDetailContent({ data, lang }: { data: unknown; lang: Lang }) {
  const user = data as MockUser | null;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-6 space-y-1.5 text-center select-none px-3">
        <span className="text-2xl opacity-30">👤</span>
        <p className="text-[11px] text-gray-400">等待客户接入</p>
      </div>
    );
  }

  const rows: { label: string; value: string; highlight?: boolean }[] = [
    { label: lang === 'zh' ? '手机号' : 'Phone',  value: user.phone },
    { label: lang === 'zh' ? '套餐'   : 'Plan',   value: user.plan[lang], highlight: true },
    { label: lang === 'zh' ? '状态'   : 'Status', value: user.status === 'active'
        ? (lang === 'zh' ? '正常' : 'Active')
        : (lang === 'zh' ? '已停机' : 'Suspended') },
  ];

  return (
    <div className="p-3 space-y-2">
      {/* Name + tag */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
          <User size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">{user.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${user.tagColor}`}>
              {user.tag[lang]}
            </span>
          </div>
        </div>
      </div>

      {/* Detail rows */}
      <div className="space-y-1 border-t border-gray-50 pt-2">
        {rows.map(r => (
          <div key={r.label} className="flex justify-between text-xs py-0.5">
            <span className="text-gray-400">{r.label}</span>
            <span className={r.highlight ? 'font-medium text-gray-800' : 'text-gray-600'}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
