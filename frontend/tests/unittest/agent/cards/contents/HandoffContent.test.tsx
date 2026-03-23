import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { HandoffContent } from '@/agent/cards/contents/HandoffContent';

describe('HandoffContent', () => {
  it('renders empty state when data is null', () => {
    render(<HandoffContent data={null} lang="zh" />);
    expect(screen.getByText('转人工后将自动显示工单摘要')).toBeInTheDocument();
  });

  it('renders empty state in English', () => {
    render(<HandoffContent data={null} lang="en" />);
    expect(screen.getByText(/Handoff summary will appear/)).toBeInTheDocument();
  });

  it('renders handoff data with session summary', () => {
    const data = {
      session_summary: '用户查询账单问题',
      customer_intent: '查询账单',
      main_issue: '费用异常',
      handoff_reason: '用户要求转人工',
      next_action: '核实费用',
    };
    render(<HandoffContent data={data} lang="zh" />);
    expect(screen.getByText('用户查询账单问题')).toBeInTheDocument();
    expect(screen.getByText('查询账单')).toBeInTheDocument();
    expect(screen.getByText('费用异常')).toBeInTheDocument();
  });

  it('renders actions taken list', () => {
    const data = {
      customer_intent: '查询',
      actions_taken: ['查询了账单', '核实了身份'],
    };
    render(<HandoffContent data={data} lang="zh" />);
    expect(screen.getByText('查询了账单')).toBeInTheDocument();
    expect(screen.getByText('核实了身份')).toBeInTheDocument();
  });

  it('renders risk flags', () => {
    const data = {
      customer_intent: '投诉',
      risk_flags: ['投诉风险', '高优先级'],
    };
    render(<HandoffContent data={data} lang="zh" />);
    expect(screen.getByText(/投诉风险/)).toBeInTheDocument();
  });

  it('does not render empty actions_taken', () => {
    const data = {
      customer_intent: '查询',
      actions_taken: [],
    };
    render(<HandoffContent data={data} lang="zh" />);
    expect(screen.queryByText('已执行：')).not.toBeInTheDocument();
  });
});
