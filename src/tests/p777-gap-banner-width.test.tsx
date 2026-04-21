import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

describe('P777: GapBanner width is caller-controlled', () => {
  it('does not hardcode max-w-sm when caller passes max-w-2xl', async () => {
    const { GapBanner } = await import('@/app/components/shared/gap-banner');
    const { container } = render(
      <GapBanner
        gap={0}
        senderName="X"
        isOverconfident={false}
        className="w-full max-w-2xl mx-auto -mt-3"
      />
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('w-full');
    expect(wrapper.className).toContain('max-w-2xl');
    expect(wrapper.className).not.toContain('max-w-sm');
  });

  it('does not hardcode max-w-sm for non-zero gap when caller passes max-w-2xl', async () => {
    const { GapBanner } = await import('@/app/components/shared/gap-banner');
    const { container } = render(
      <GapBanner
        gap={3}
        senderName="X"
        isOverconfident={true}
        className="w-full max-w-2xl mx-auto -mt-3"
      />
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('w-full');
    expect(wrapper.className).toContain('max-w-2xl');
    expect(wrapper.className).not.toContain('max-w-sm');
  });
});
