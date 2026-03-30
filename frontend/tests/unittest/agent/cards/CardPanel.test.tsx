import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Must import cards/index to register card defs before CardPanel
import '@/agent/cards/index';
import { CardPanel } from '@/agent/cards/CardPanel';
import { buildInitialCardStates, type CardState } from '@/agent/cards/registry';

describe('CardPanel', () => {
  const mockOnUpdate = vi.fn();

  it('renders without crashing with empty cards', () => {
    render(<CardPanel cards={[]} lang="zh" onUpdate={mockOnUpdate} />);
    expect(screen.getByText('暂无卡片')).toBeInTheDocument();
  });

  it('renders with initial card states', () => {
    const cards = buildInitialCardStates();
    render(<CardPanel cards={cards} lang="zh" onUpdate={mockOnUpdate} />);
    // Should render the card container
    const container = document.querySelector('.flex.flex-col');
    expect(container).toBeInTheDocument();
  });

  it('renders closed card restore chips when cards are closed', () => {
    const cards = buildInitialCardStates().map(c => ({ ...c, isOpen: false }));
    render(<CardPanel cards={cards} lang="zh" onUpdate={mockOnUpdate} />);
    // Should show restore buttons
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('calls onUpdate when a closed card chip is clicked', () => {
    const cards = buildInitialCardStates().map(c => ({ ...c, isOpen: false }));
    render(<CardPanel cards={cards} lang="zh" onUpdate={mockOnUpdate} />);
    const buttons = document.querySelectorAll('button');
    if (buttons.length > 0) {
      fireEvent.click(buttons[0]);
      expect(mockOnUpdate).toHaveBeenCalled();
    }
  });
});
