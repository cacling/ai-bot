/**
 * Unit tests for: intake-service normalizers (self_service_form, external_monitoring)
 */
import { describe, test, expect } from 'bun:test';
import { normalizeSelfServiceForm, normalizeExternalMonitoring } from '../../src/services/intake-service';

const baseIntake = {
  customer_phone: null,
  customer_name: null,
  subject: null,
  source_channel: null,
  risk_score: null,
  sentiment_score: null,
};

describe('normalizeSelfServiceForm', () => {
  test('extracts form fields', () => {
    const raw = {
      contact_phone: '13811111111',
      contact_name: '表单用户',
      form_title: '宽带报修',
      form_description: '光猫闪红灯',
      service_type: 'ticket.incident.broadband',
      form_id: 'form_001',
    };
    const { normalized, confidence_score } = normalizeSelfServiceForm(raw, baseIntake);
    expect(normalized.customer_phone).toBe('13811111111');
    expect(normalized.customer_name).toBe('表单用户');
    expect(normalized.subject).toBe('宽带报修');
    expect(normalized.summary).toBe('光猫闪红灯');
    expect(normalized.category_code).toBe('ticket.incident.broadband');
    expect(normalized.ticket_category).toBe('request');
    expect(normalized.channel).toBe('self_service');
    expect(normalized.form_id).toBe('form_001');
    // Complete form → high confidence
    expect(confidence_score).toBeGreaterThanOrEqual(80);
  });

  test('extracts appointment plan from preferred_time', () => {
    const raw = {
      form_title: '营业厅办理',
      preferred_time: '2026-04-01T10:00:00+08:00',
      store_name: '长营路营业厅',
    };
    const { normalized } = normalizeSelfServiceForm(raw, baseIntake);
    expect(normalized.appointment_plan).toBeDefined();
    const plan = normalized.appointment_plan as any;
    expect(plan.appointment_type).toBe('store_visit');
    expect(plan.preferred_time).toBe('2026-04-01T10:00:00+08:00');
    expect(plan.location).toBe('长营路营业厅');
  });

  test('intake fields take priority over raw', () => {
    const raw = { contact_phone: '13899999999', form_title: '原始标题' };
    const intake = { ...baseIntake, customer_phone: '13800000001', subject: '覆盖标题' };
    const { normalized } = normalizeSelfServiceForm(raw, intake);
    expect(normalized.customer_phone).toBe('13800000001');
    expect(normalized.subject).toBe('覆盖标题');
  });
});

describe('normalizeExternalMonitoring', () => {
  test('extracts alert fields', () => {
    const raw = {
      alert_title: '基站断电告警',
      alert_description: '朝阳区某基站 UPS 断电',
      alert_type: 'power_outage',
      alert_id: 'alert_001',
      severity: 'critical',
      monitoring_system: 'zabbix',
    };
    const { normalized, signals } = normalizeExternalMonitoring(raw, baseIntake);
    expect(normalized.subject).toBe('基站断电告警');
    expect(normalized.summary).toBe('朝阳区某基站 UPS 断电');
    expect(normalized.alert_type).toBe('power_outage');
    expect(normalized.alert_severity).toBe('critical');
    expect(normalized.ticket_category).toBe('incident');
    expect(normalized.channel).toBe('monitoring');
    expect(normalized.monitoring_source).toBe('zabbix');
    expect(signals.risk_score).toBe(95);
    expect(signals.alert_severity).toBe('critical');
  });

  test('critical severity generates appointment_plan', () => {
    const raw = { alert_title: '紧急', severity: 'critical' };
    const { normalized } = normalizeExternalMonitoring(raw, baseIntake);
    expect(normalized.appointment_plan).toBeDefined();
    const plan = normalized.appointment_plan as any;
    expect(plan.urgency).toBe('immediate');
  });

  test('non-critical severity has no appointment_plan', () => {
    const raw = { alert_title: '一般', severity: 'medium' };
    const { normalized } = normalizeExternalMonitoring(raw, baseIntake);
    expect(normalized.appointment_plan).toBeUndefined();
  });

  test('auto-calculates risk_score from severity', () => {
    const cases: [string, number][] = [['critical', 95], ['high', 80], ['medium', 50], ['low', 20]];
    for (const [sev, expected] of cases) {
      const { signals } = normalizeExternalMonitoring({ severity: sev }, baseIntake);
      expect(signals.risk_score).toBe(expected);
    }
  });

  test('confidence_score reflects alert completeness', () => {
    const full = { alert_id: 'a1', alert_type: 'power', severity: 'critical', alert_description: '断电' };
    const { confidence_score: fullScore } = normalizeExternalMonitoring(full, baseIntake);
    expect(fullScore).toBeGreaterThanOrEqual(90);

    const minimal = { severity: 'low' };
    const { confidence_score: minScore } = normalizeExternalMonitoring(minimal, baseIntake);
    expect(minScore).toBeLessThan(fullScore);
  });

  test('intake risk_score overrides auto-calculation', () => {
    const raw = { severity: 'critical' };
    const intake = { ...baseIntake, risk_score: 60 };
    const { signals } = normalizeExternalMonitoring(raw, intake);
    expect(signals.risk_score).toBe(60);
  });

  test('high severity generates work_type execution', () => {
    const raw = { severity: 'high' };
    const { normalized } = normalizeExternalMonitoring(raw, baseIntake);
    expect(normalized.work_type).toBe('execution');
  });

  test('default subject from alert_type', () => {
    const raw = { alert_type: 'disk_full' };
    const { normalized } = normalizeExternalMonitoring(raw, baseIntake);
    expect(normalized.subject).toBe('监控告警: disk_full');
  });
});
