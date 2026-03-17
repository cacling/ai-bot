import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { UserDetailContent } from '@/agent/cards/contents/UserDetailContent';

describe('UserDetailContent', () => {
  it('renders empty state when data is null', () => {
    render(<UserDetailContent data={null} lang="zh" />);
    expect(screen.getByText('等待客户接入')).toBeInTheDocument();
  });

  const mockUser = {
    id: '1',
    phone: '13800000001',
    name: '张三',
    plan: { zh: '畅享套餐', en: 'Premium Plan' },
    status: 'active' as const,
    tag: { zh: 'VIP', en: 'VIP' },
    tagColor: 'bg-blue-100 text-blue-600',
    type: 'inbound' as const,
  };

  it('renders user name', () => {
    render(<UserDetailContent data={mockUser} lang="zh" />);
    expect(screen.getByText('张三')).toBeInTheDocument();
  });

  it('renders user phone', () => {
    render(<UserDetailContent data={mockUser} lang="zh" />);
    expect(screen.getByText('13800000001')).toBeInTheDocument();
  });

  it('renders plan name in zh', () => {
    render(<UserDetailContent data={mockUser} lang="zh" />);
    expect(screen.getByText('畅享套餐')).toBeInTheDocument();
  });

  it('renders plan name in en', () => {
    render(<UserDetailContent data={mockUser} lang="en" />);
    expect(screen.getByText('Premium Plan')).toBeInTheDocument();
  });

  it('renders active status in zh', () => {
    render(<UserDetailContent data={mockUser} lang="zh" />);
    expect(screen.getByText('正常')).toBeInTheDocument();
  });

  it('renders active status in en', () => {
    render(<UserDetailContent data={mockUser} lang="en" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders suspended status in zh', () => {
    const suspendedUser = { ...mockUser, status: 'suspended' as const };
    render(<UserDetailContent data={suspendedUser} lang="zh" />);
    expect(screen.getByText('已停机')).toBeInTheDocument();
  });

  it('renders suspended status in en', () => {
    const suspendedUser = { ...mockUser, status: 'suspended' as const };
    render(<UserDetailContent data={suspendedUser} lang="en" />);
    expect(screen.getByText('Suspended')).toBeInTheDocument();
  });

  it('renders tag', () => {
    render(<UserDetailContent data={mockUser} lang="zh" />);
    expect(screen.getByText('VIP')).toBeInTheDocument();
  });
});
