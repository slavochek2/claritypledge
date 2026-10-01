import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TagPills } from '@/app/components/shared/tag-pills';

describe('TagPills hides version tags', () => {
  it('shows the set and its st number, never v1/v2', () => {
    render(<MemoryRouter><TagPills tags={['ikigai1']} systemTags={['misunderstanding', 'st1', 'v2']} context="feed" /></MemoryRouter>);
    expect(screen.getByText('#misunderstanding')).toBeTruthy();
    expect(screen.getByText('#st1')).toBeTruthy();
    expect(screen.getByText('#ikigai1')).toBeTruthy();
    expect(screen.queryByText('#v2')).toBeNull();
  });

  it('renders nothing when a version tag is the only tag', () => {
    const { container } = render(<MemoryRouter><TagPills systemTags={['v1']} context="detail" /></MemoryRouter>);
    expect(container.innerHTML).toBe('');
  });
});
