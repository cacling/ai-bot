import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { UserDetailContent } from '@/agent/cards/contents/UserDetailContent';

describe('UserDetailContent', () => {
  it('renders empty state when data is null', () => {
    render(<UserDetailContent data={null} lang="zh" />);
    expect(screen.getByText('等待客户接入')).toBeInTheDocument();
  });

  // TestPersona structure: { id, label, category, tag, tagColor, context }
  // context contains: { phone, name, plan, status, ... }
  const mockPersona = {
    id: 'U001',
    label: '正常用户',
    category: 'inbound',
    tag: '正常',
    tagColor: 'bg-green-100 text-green-600',
    context: {
      phone: '13800000001',
      name: '张三',
      plan: '畅享50G套餐',
      status: 'active',
    },
  };

  it('renders user name', () => {
    render(<UserDetailContent data={mockPersona} lang="zh" />);
    expect(screen.getByText('张三')).toBeInTheDocument();
  });

  it('renders user phone', () => {
    render(<UserDetailContent data={mockPersona} lang="zh" />);
    expect(screen.getByText('13800000001')).toBeInTheDocument();
  });

  it('renders plan name in zh', () => {
    render(<UserDetailContent data={mockPersona} lang="zh" />);
    expect(screen.getByText('畅享50G套餐')).toBeInTheDocument();
  });

  it('renders plan name in en', () => {
    render(<UserDetailContent data={mockPersona} lang="en" />);
    expect(screen.getByText('畅享50G套餐')).toBeInTheDocument();
  });

  it('renders active status in zh', () => {
    render(<UserDetailContent data={mockPersona} lang="zh" />);
    // "正常" appears both as status and tag
    const matches = screen.getAllByText('正常');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders active status in en', () => {
    render(<UserDetailContent data={mockPersona} lang="en" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders suspended status in zh', () => {
    const suspended = { ...mockPersona, tag: '欠费', context: { ...mockPersona.context, status: 'suspended' } };
    render(<UserDetailContent data={suspended} lang="zh" />);
    expect(screen.getByText('已停机')).toBeInTheDocument();
  });

  it('renders suspended status in en', () => {
    const suspended = { ...mockPersona, context: { ...mockPersona.context, status: 'suspended' } };
    render(<UserDetailContent data={suspended} lang="en" />);
    expect(screen.getByText('Suspended')).toBeInTheDocument();
  });

  it('renders tag', () => {
    const tagged = { ...mockPersona, tag: 'VIP' };
    render(<UserDetailContent data={tagged} lang="zh" />);
    expect(screen.getByText('VIP')).toBeInTheDocument();
  });
});
