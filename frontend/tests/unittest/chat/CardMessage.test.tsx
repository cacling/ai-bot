import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { CardMessage } from '@/chat/CardMessage';
import type { BillCardData, CancelCardData, PlanCardData, DiagnosticCardData, HandoffCardData } from '@/chat/CardMessage';

describe('CardMessage', () => {
  describe('BillCard', () => {
    const billData: BillCardData = {
      month: '2024-03',
      total: 128.5,
      plan_fee: 99,
      data_fee: 15,
      voice_fee: 5.5,
      value_added_fee: 6,
      tax: 3,
      status: 'paid',
    };

    it('renders bill card with month and total', () => {
      render(<CardMessage card={{ type: 'bill_card', data: billData }} lang="zh" />);
      expect(screen.getByText(/2024-03/)).toBeInTheDocument();
      expect(screen.getByText('¥128.50')).toBeInTheDocument();
    });

    it('renders paid status label in zh', () => {
      render(<CardMessage card={{ type: 'bill_card', data: billData }} lang="zh" />);
      expect(screen.getByText('已缴清')).toBeInTheDocument();
    });

    it('renders overdue status label', () => {
      const overdueData = { ...billData, status: 'overdue' };
      render(<CardMessage card={{ type: 'bill_card', data: overdueData }} lang="zh" />);
      expect(screen.getByText('逾期未缴')).toBeInTheDocument();
    });

    it('renders pending status label', () => {
      const pendingData = { ...billData, status: 'pending' };
      render(<CardMessage card={{ type: 'bill_card', data: pendingData }} lang="zh" />);
      expect(screen.getByText('待缴费')).toBeInTheDocument();
    });

    it('renders in English', () => {
      render(<CardMessage card={{ type: 'bill_card', data: billData }} lang="en" />);
      expect(screen.getByText('Paid')).toBeInTheDocument();
      expect(screen.getByText('Total Amount')).toBeInTheDocument();
    });

    it('renders all fee line items', () => {
      render(<CardMessage card={{ type: 'bill_card', data: billData }} lang="zh" />);
      expect(screen.getByText('套餐月费')).toBeInTheDocument();
      expect(screen.getByText('流量超额费')).toBeInTheDocument();
      expect(screen.getByText('通话超额费')).toBeInTheDocument();
      expect(screen.getByText('增值业务费')).toBeInTheDocument();
      expect(screen.getByText('税费')).toBeInTheDocument();
    });
  });

  describe('CancelCard', () => {
    const cancelData: CancelCardData = {
      service_name: 'VIP会员',
      monthly_fee: 30,
      effective_end: '2024-04-01',
      phone: '13800000001',
    };

    it('renders cancel card with service name', () => {
      render(<CardMessage card={{ type: 'cancel_card', data: cancelData }} lang="zh" />);
      expect(screen.getByText('VIP会员')).toBeInTheDocument();
    });

    it('renders effective date', () => {
      render(<CardMessage card={{ type: 'cancel_card', data: cancelData }} lang="zh" />);
      expect(screen.getByText('2024-04-01')).toBeInTheDocument();
    });

    it('renders phone number', () => {
      render(<CardMessage card={{ type: 'cancel_card', data: cancelData }} lang="zh" />);
      expect(screen.getByText('13800000001')).toBeInTheDocument();
    });

    it('renders notice with date placeholder replaced', () => {
      render(<CardMessage card={{ type: 'cancel_card', data: cancelData }} lang="zh" />);
      expect(screen.getByText(/2024-04-01.*生效/)).toBeInTheDocument();
    });

    it('renders in English', () => {
      render(<CardMessage card={{ type: 'cancel_card', data: cancelData }} lang="en" />);
      expect(screen.getByText('Cancellation Confirmed')).toBeInTheDocument();
    });
  });

  describe('PlanCard', () => {
    const planData: PlanCardData = {
      name: '畅享套餐',
      monthly_fee: 129,
      data_gb: 40,
      voice_min: 500,
      features: ['5G', '视频会员'],
      description: '适合重度用户',
    };

    it('renders plan name and fee', () => {
      render(<CardMessage card={{ type: 'plan_card', data: planData }} lang="zh" />);
      expect(screen.getByText('畅享套餐')).toBeInTheDocument();
      expect(screen.getByText('¥129')).toBeInTheDocument();
    });

    it('renders data and voice amounts', () => {
      render(<CardMessage card={{ type: 'plan_card', data: planData }} lang="zh" />);
      expect(screen.getByText('40GB')).toBeInTheDocument();
      expect(screen.getByText('500分钟')).toBeInTheDocument();
    });

    it('renders unlimited data when data_gb is -1', () => {
      const unlimitedData = { ...planData, data_gb: -1 };
      render(<CardMessage card={{ type: 'plan_card', data: unlimitedData }} lang="zh" />);
      expect(screen.getByText('不限量')).toBeInTheDocument();
    });

    it('renders unlimited voice when voice_min is -1', () => {
      const unlimitedVoice = { ...planData, voice_min: -1 };
      render(<CardMessage card={{ type: 'plan_card', data: unlimitedVoice }} lang="zh" />);
      // There is one "不限量" for voice
      expect(screen.getAllByText('不限量').length).toBeGreaterThanOrEqual(1);
    });

    it('renders features', () => {
      render(<CardMessage card={{ type: 'plan_card', data: planData }} lang="zh" />);
      expect(screen.getByText('5G')).toBeInTheDocument();
      expect(screen.getByText('视频会员')).toBeInTheDocument();
    });

    it('renders description', () => {
      render(<CardMessage card={{ type: 'plan_card', data: planData }} lang="zh" />);
      expect(screen.getByText('适合重度用户')).toBeInTheDocument();
    });

    it('renders in English with min unit', () => {
      render(<CardMessage card={{ type: 'plan_card', data: planData }} lang="en" />);
      expect(screen.getByText('500min')).toBeInTheDocument();
      expect(screen.getByText('/mo')).toBeInTheDocument();
    });
  });

  describe('DiagnosticCard', () => {
    const diagData: DiagnosticCardData = {
      issue_type: 'slow_data',
      diagnostic_steps: [
        { step: 'Check signal', status: 'ok', detail: 'Signal is strong' },
        { step: 'Check bandwidth', status: 'warning', detail: 'Slightly slow' },
        { step: 'Check tower', status: 'error', detail: 'Tower overloaded' },
      ],
      conclusion: 'Network congestion detected',
    };

    it('renders diagnostic issue type label', () => {
      render(<CardMessage card={{ type: 'diagnostic_card', data: diagData }} lang="zh" />);
      expect(screen.getByText('网速慢诊断')).toBeInTheDocument();
    });

    it('renders all diagnostic steps', () => {
      render(<CardMessage card={{ type: 'diagnostic_card', data: diagData }} lang="zh" />);
      expect(screen.getByText('Check signal')).toBeInTheDocument();
      expect(screen.getByText('Check bandwidth')).toBeInTheDocument();
      expect(screen.getByText('Check tower')).toBeInTheDocument();
    });

    it('renders conclusion', () => {
      render(<CardMessage card={{ type: 'diagnostic_card', data: diagData }} lang="zh" />);
      expect(screen.getByText('Network congestion detected')).toBeInTheDocument();
    });

    it('renders default label for unknown issue type', () => {
      const unknownDiag = { ...diagData, issue_type: 'unknown_type' };
      render(<CardMessage card={{ type: 'diagnostic_card', data: unknownDiag }} lang="zh" />);
      expect(screen.getByText('网络诊断')).toBeInTheDocument();
    });

    it('renders in English', () => {
      render(<CardMessage card={{ type: 'diagnostic_card', data: diagData }} lang="en" />);
      expect(screen.getByText('Slow Data Diagnosis')).toBeInTheDocument();
    });
  });

  describe('HandoffCard', () => {
    const handoffData: HandoffCardData = {
      customer_intent: '查询账单',
      main_issue: '费用异常',
      business_object: ['账单'],
      confirmed_information: ['手机号已确认'],
      actions_taken: ['查询了账单', '核实了费用'],
      current_status: '未解决',
      handoff_reason: '用户要求转人工',
      next_action: '核实费用明细',
      priority: '高',
      risk_flags: ['投诉风险'],
      session_summary: '用户来电查询本月账单异常',
    };

    it('renders handoff title', () => {
      render(<CardMessage card={{ type: 'handoff_card', data: handoffData }} lang="zh" />);
      expect(screen.getByText('已转接人工客服')).toBeInTheDocument();
    });

    it('renders priority and status badges', () => {
      render(<CardMessage card={{ type: 'handoff_card', data: handoffData }} lang="zh" />);
      expect(screen.getByText(/高.*优先级/)).toBeInTheDocument();
      expect(screen.getByText('未解决')).toBeInTheDocument();
    });

    it('renders customer intent', () => {
      render(<CardMessage card={{ type: 'handoff_card', data: handoffData }} lang="zh" />);
      expect(screen.getByText('查询账单')).toBeInTheDocument();
    });

    it('renders session summary', () => {
      render(<CardMessage card={{ type: 'handoff_card', data: handoffData }} lang="zh" />);
      expect(screen.getByText('用户来电查询本月账单异常')).toBeInTheDocument();
    });

    it('renders actions taken', () => {
      render(<CardMessage card={{ type: 'handoff_card', data: handoffData }} lang="zh" />);
      expect(screen.getByText(/已执行操作/)).toBeInTheDocument();
    });

    it('renders risk flags', () => {
      render(<CardMessage card={{ type: 'handoff_card', data: handoffData }} lang="zh" />);
      expect(screen.getByText('投诉风险')).toBeInTheDocument();
    });

    it('renders in English', () => {
      render(<CardMessage card={{ type: 'handoff_card', data: handoffData }} lang="en" />);
      expect(screen.getByText('Transferred to Agent')).toBeInTheDocument();
    });
  });

  describe('unknown card type', () => {
    it('returns null for unknown card type', () => {
      const { container } = render(
        <CardMessage card={{ type: 'nonexistent' as any, data: {} as any }} lang="zh" />
      );
      expect(container.innerHTML).toBe('');
    });
  });
});
