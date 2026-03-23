import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  InlineMarkdown,
  SkillCard,
  SaveIndicator,
  ViewToggle,
  UnsavedDialog,
} from '@/km/components/SkillEditorWidgets';

describe('InlineMarkdown', () => {
  it('renders plain text', () => {
    render(<InlineMarkdown text="Hello World" />);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders bold text', () => {
    render(<InlineMarkdown text="This is **bold** text" />);
    expect(screen.getByText('bold')).toBeInTheDocument();
    const strong = document.querySelector('strong');
    expect(strong).toBeInTheDocument();
  });

  it('renders inline code', () => {
    render(<InlineMarkdown text="Use `code` here" />);
    const code = document.querySelector('code');
    expect(code).toBeInTheDocument();
    expect(code?.textContent).toBe('code');
  });

  it('renders multiline text', () => {
    render(<InlineMarkdown text={'Line 1\nLine 2'} />);
    expect(screen.getByText('Line 1')).toBeInTheDocument();
    expect(screen.getByText('Line 2')).toBeInTheDocument();
  });
});

describe('SkillCard', () => {
  const mockSkill = {
    id: 'skill-1',
    name: 'Test Skill',
    description: 'A test skill description',
    updatedAt: new Date().toISOString(),
    messages: [],
  };

  it('renders without crashing', () => {
    render(<SkillCard skill={mockSkill} onClick={vi.fn()} />);
    expect(screen.getByText('Test Skill')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(<SkillCard skill={mockSkill} onClick={vi.fn()} />);
    expect(screen.getByText('A test skill description')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<SkillCard skill={mockSkill} onClick={onClick} />);
    fireEvent.click(screen.getByText('Test Skill'));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('SaveIndicator', () => {
  it('renders saving state', () => {
    render(<SaveIndicator status="saving" />);
    expect(screen.getByText(/保存中/)).toBeInTheDocument();
  });

  it('renders saved state', () => {
    render(<SaveIndicator status="saved" />);
    expect(screen.getByText('已保存')).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(<SaveIndicator status="error" />);
    expect(screen.getByText('保存失败')).toBeInTheDocument();
  });

  it('renders nothing for idle state', () => {
    const { container } = render(<SaveIndicator status="idle" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('ViewToggle', () => {
  it('renders without crashing', () => {
    render(<ViewToggle viewMode="edit" onChange={vi.fn()} />);
    expect(screen.getByText('预览')).toBeInTheDocument();
  });

  it('toggles view mode on click', () => {
    const onChange = vi.fn();
    render(<ViewToggle viewMode="edit" onChange={onChange} />);
    fireEvent.click(screen.getByText('预览'));
    expect(onChange).toHaveBeenCalledWith('preview');
  });

  it('toggles back to edit from preview', () => {
    const onChange = vi.fn();
    render(<ViewToggle viewMode="preview" onChange={onChange} />);
    fireEvent.click(screen.getByText('预览'));
    expect(onChange).toHaveBeenCalledWith('edit');
  });
});

describe('UnsavedDialog', () => {
  it('renders without crashing', () => {
    render(<UnsavedDialog onCancel={vi.fn()} onDiscard={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText('有未保存的修改')).toBeInTheDocument();
  });

  it('renders all three buttons', () => {
    render(<UnsavedDialog onCancel={vi.fn()} onDiscard={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText('保存并离开')).toBeInTheDocument();
    expect(screen.getByText('不保存直接离开')).toBeInTheDocument();
    expect(screen.getByText('取消')).toBeInTheDocument();
  });

  it('calls onSave when save button is clicked', () => {
    const onSave = vi.fn();
    render(<UnsavedDialog onCancel={vi.fn()} onDiscard={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByText('保存并离开'));
    expect(onSave).toHaveBeenCalled();
  });

  it('calls onDiscard when discard button is clicked', () => {
    const onDiscard = vi.fn();
    render(<UnsavedDialog onCancel={vi.fn()} onDiscard={onDiscard} onSave={vi.fn()} />);
    fireEvent.click(screen.getByText('不保存直接离开'));
    expect(onDiscard).toHaveBeenCalled();
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<UnsavedDialog onCancel={onCancel} onDiscard={vi.fn()} onSave={vi.fn()} />);
    fireEvent.click(screen.getByText('取消'));
    expect(onCancel).toHaveBeenCalled();
  });
});
