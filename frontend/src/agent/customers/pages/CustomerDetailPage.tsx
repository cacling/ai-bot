/**
 * CustomerDetailPage.tsx — 客户详情（360画像）
 *
 * 头部信息卡 + Tab 页（基础信息 / 身份标识 / 行为轨迹 / 隐私授权）
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, User, Fingerprint, Activity, ShieldCheck } from 'lucide-react';
import { useAgentContext } from '../../AgentContext';
import { fetchCustomerDetail, type CustomerDetail } from '../api';

type DetailTab = 'basic' | 'identity' | 'events' | 'consent';

const TAB_DEFS: { id: DetailTab; Icon: typeof User; label: Record<string, string> }[] = [
  { id: 'basic', Icon: User, label: { zh: '基础信息', en: 'Basic Info' } },
  { id: 'identity', Icon: Fingerprint, label: { zh: '身份标识', en: 'Identities' } },
  { id: 'events', Icon: Activity, label: { zh: '行为轨迹', en: 'Events' } },
  { id: 'consent', Icon: ShieldCheck, label: { zh: '隐私授权', en: 'Consent' } },
];

function maskPhone(phone: string): string {
  if (phone.length >= 7) return phone.slice(0, 3) + '****' + phone.slice(-4);
  return phone;
}

function parseJson(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export const CustomerDetailPage = memo(function CustomerDetailPage() {
  const { lang } = useAgentContext();
  const { partyId } = useParams<{ partyId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('basic');

  const load = useCallback(async () => {
    if (!partyId) return;
    setLoading(true);
    try {
      const res = await fetchCustomerDetail(partyId);
      setData(res);
    } catch (err) {
      console.error('Failed to load customer detail:', err);
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        {lang === 'zh' ? '加载中...' : 'Loading...'}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        {lang === 'zh' ? '客户不存在' : 'Customer not found'}
      </div>
    );
  }

  const party = data.party;
  const primaryPhone = data.identities.find((i) => i.identity_type === 'phone' && i.primary_flag);
  const basicProfile = parseJson(data.profile?.basic_profile_json ?? null);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate('/staff/operations/customers/list')}>
            <ArrowLeft size={16} />
          </Button>
          <h2 className="text-base font-semibold">{party.display_name || party.canonical_name || 'Unknown'}</h2>
          <Badge variant={party.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
            {party.status}
          </Badge>
        </div>
        <div className="flex items-center gap-6 text-xs text-muted-foreground ml-9">
          <span>{lang === 'zh' ? '手机' : 'Phone'}: {primaryPhone ? maskPhone(primaryPhone.identity_value) : '-'}</span>
          <span>{lang === 'zh' ? '等级' : 'Tier'}: {String(basicProfile.customer_tier ?? '-')}</span>
          <span>{lang === 'zh' ? '性别' : 'Gender'}: {String(basicProfile.gender ?? '-')}</span>
          <span>{lang === 'zh' ? '地区' : 'Region'}: {String(basicProfile.region ?? '-')}</span>
          <span>ID: <span className="font-mono">{party.party_id.slice(0, 8)}...</span></span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 bg-background border-b border-border px-4 flex items-center h-9">
        {TAB_DEFS.map((tab) => (
          <Button
            key={tab.id}
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 h-full rounded-none text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <tab.Icon size={13} />
            {tab.label[lang]}
          </Button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'basic' && <BasicInfoTab data={data} lang={lang} />}
        {activeTab === 'identity' && <IdentityTab data={data} lang={lang} />}
        {activeTab === 'events' && <EventsTab data={data} lang={lang} />}
        {activeTab === 'consent' && <ConsentTab data={data} lang={lang} />}
      </div>
    </div>
  );
});

// ── Tab Content Components ──

function BasicInfoTab({ data, lang }: { data: CustomerDetail; lang: string }) {
  const basic = parseJson(data.profile?.basic_profile_json ?? null);
  const contact = parseJson(data.profile?.contact_profile_json ?? null);
  const service = parseJson(data.profile?.service_profile_json ?? null);

  const fields: Array<[string, string, unknown]> = [
    [lang === 'zh' ? '姓名' : 'Name', 'display_name', data.party.display_name],
    [lang === 'zh' ? '性别' : 'Gender', 'gender', basic.gender],
    [lang === 'zh' ? '客户等级' : 'Tier', 'customer_tier', basic.customer_tier],
    [lang === 'zh' ? '偏好语言' : 'Language', 'preferred_language', basic.preferred_language],
    [lang === 'zh' ? '地区' : 'Region', 'region', basic.region],
    [lang === 'zh' ? '手机' : 'Phone', 'phone', contact.phone],
    [lang === 'zh' ? '邮箱' : 'Email', 'email', contact.email],
    [lang === 'zh' ? '套餐' : 'Plan', 'plan_name', service.plan_name],
    [lang === 'zh' ? '套餐类型' : 'Plan Type', 'plan_type', service.plan_type],
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{lang === 'zh' ? '客户画像' : 'Customer Profile'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {fields.map(([label, , value]) => (
              <div key={label} className="flex items-center text-sm">
                <span className="w-24 text-muted-foreground flex-shrink-0">{label}</span>
                <span>{String(value ?? '-')}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{lang === 'zh' ? '联系方式' : 'Contact Points'}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.contact_points.length === 0 ? (
            <p className="text-sm text-muted-foreground">{lang === 'zh' ? '暂无' : 'None'}</p>
          ) : (
            <div className="space-y-2">
              {data.contact_points.map((cp) => (
                <div key={cp.contact_point_id} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-[10px]">{cp.contact_type}</Badge>
                  <span className="font-mono text-xs">
                    {cp.contact_type === 'phone' ? maskPhone(cp.contact_value) : cp.contact_value}
                  </span>
                  {cp.preferred_flag && (
                    <Badge variant="default" className="text-[10px]">
                      {lang === 'zh' ? '首选' : 'Preferred'}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function IdentityTab({ data, lang }: { data: CustomerDetail; lang: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{lang === 'zh' ? '类型' : 'Type'}</TableHead>
          <TableHead>{lang === 'zh' ? '标识值' : 'Value'}</TableHead>
          <TableHead>{lang === 'zh' ? '主标识' : 'Primary'}</TableHead>
          <TableHead>{lang === 'zh' ? '已验证' : 'Verified'}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.identities.map((id) => (
          <TableRow key={id.party_identity_id}>
            <TableCell>
              <Badge variant="outline" className="text-[10px]">{id.identity_type}</Badge>
            </TableCell>
            <TableCell className="font-mono text-xs">
              {id.identity_type === 'phone' ? maskPhone(id.identity_value) : id.identity_value}
            </TableCell>
            <TableCell>{id.primary_flag ? '✓' : '-'}</TableCell>
            <TableCell>{id.verified_flag ? '✓' : '-'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function EventsTab({ data, lang }: { data: CustomerDetail; lang: string }) {
  if (data.recent_events.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{lang === 'zh' ? '暂无行为记录' : 'No events'}</p>;
  }

  return (
    <div className="space-y-2 max-w-2xl">
      {data.recent_events.map((ev) => (
        <div key={ev.customer_event_id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
          <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{ev.event_type}</span>
              <Badge variant="outline" className="text-[10px]">{ev.event_category}</Badge>
              {ev.severity && (
                <Badge variant={ev.severity === 'high' ? 'destructive' : 'secondary'} className="text-[10px]">
                  {ev.severity}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {new Date(ev.event_time).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}
              {ev.channel_type && ` · ${ev.channel_type}`}
              {` · ${ev.source_system}`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ConsentTab({ data, lang }: { data: CustomerDetail; lang: string }) {
  if (data.consents.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{lang === 'zh' ? '暂无授权记录' : 'No consent records'}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{lang === 'zh' ? '渠道' : 'Channel'}</TableHead>
          <TableHead>{lang === 'zh' ? '用途' : 'Purpose'}</TableHead>
          <TableHead>{lang === 'zh' ? '状态' : 'Status'}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.consents.map((c) => (
          <TableRow key={c.consent_record_id}>
            <TableCell>
              <Badge variant="outline" className="text-[10px]">{c.channel_type}</Badge>
            </TableCell>
            <TableCell className="text-sm">{c.purpose_type}</TableCell>
            <TableCell>
              <Badge
                variant={c.consent_status === 'granted' ? 'default' : 'destructive'}
                className="text-[10px]"
              >
                {c.consent_status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
