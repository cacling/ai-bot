import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { OutboundTaskContent } from '@/agent/cards/contents/OutboundTaskContent';

describe('OutboundTaskContent', () => {
  it('renders empty state when data is null', () => {
    render(<OutboundTaskContent data={null} lang="zh" />);
    expect(screen.getByText('切换外呼客户后将自动显示任务详情')).toBeInTheDocument();
  });

  it('renders empty state in English', () => {
    render(<OutboundTaskContent data={null} lang="en" />);
    expect(screen.getByText(/Switch to an outbound customer/)).toBeInTheDocument();
  });

  it('renders collection task data in zh', () => {
    const data = {
      taskType: 'collection' as const,
      name: '张三',
      phone: '13800000001',
      product: { zh: '信用卡A', en: 'Credit Card A' },
      amount: 5000,
      days: 30,
    };
    render(<OutboundTaskContent data={data} lang="zh" />);
    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('信用卡A')).toBeInTheDocument();
    expect(screen.getByText(/5,000/)).toBeInTheDocument();
    expect(screen.getByText('30 天')).toBeInTheDocument();
  });

  it('renders collection task data in en', () => {
    const data = {
      taskType: 'collection' as const,
      name: '张三',
      phone: '13800000001',
      product: { zh: '信用卡A', en: 'Credit Card A' },
      amount: 5000,
      days: 30,
    };
    render(<OutboundTaskContent data={data} lang="en" />);
    expect(screen.getByText('Credit Card A')).toBeInTheDocument();
    expect(screen.getByText('30 days')).toBeInTheDocument();
  });

  it('renders marketing task data in zh', () => {
    const data = {
      taskType: 'marketing' as const,
      name: '李四',
      phone: '13800000002',
      currentPlan: { zh: '基础套餐', en: 'Basic Plan' },
      targetPlan: { zh: '高级套餐', en: 'Premium Plan' },
      targetFee: 99,
      campaignName: { zh: '新年促销', en: 'New Year Sale' },
    };
    render(<OutboundTaskContent data={data} lang="zh" />);
    expect(screen.getByText('李四')).toBeInTheDocument();
    expect(screen.getByText('基础套餐')).toBeInTheDocument();
    expect(screen.getByText(/高级套餐.*¥99/)).toBeInTheDocument();
    expect(screen.getByText('新年促销')).toBeInTheDocument();
  });

  it('renders marketing task data in en', () => {
    const data = {
      taskType: 'marketing' as const,
      name: '李四',
      phone: '13800000002',
      currentPlan: { zh: '基础套餐', en: 'Basic Plan' },
      targetPlan: { zh: '高级套餐', en: 'Premium Plan' },
      targetFee: 99,
      campaignName: { zh: '新年促销', en: 'New Year Sale' },
    };
    render(<OutboundTaskContent data={data} lang="en" />);
    expect(screen.getByText('Basic Plan')).toBeInTheDocument();
    expect(screen.getByText(/Premium Plan.*¥99/)).toBeInTheDocument();
    expect(screen.getByText('New Year Sale')).toBeInTheDocument();
  });
});
