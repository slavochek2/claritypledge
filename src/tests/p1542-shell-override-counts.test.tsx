// @vitest-environment jsdom
/**
 * P1542 review round 5 (D5, checked, not changed): the shell overrides are COUNTED, not set/unset. The in-room close
 * closing (unmounting) takes back only its own claim: while the room's own learning (mounted, inRoom) still claims the
 * app menu, the menu stays declared, and a second "hide the strip" claim keeps the strip hidden — no flicker.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAppMenuDeclared, useDeclareAppMenu, useHideTodaysStrip, useTodaysStripHidden } from '@/app/components/layout/app-menu-override';

function Claim({ menu, strip }: { menu: boolean; strip: boolean }) {
  useDeclareAppMenu(menu);
  useHideTodaysStrip(strip);
  return null;
}
function Read() {
  return <i data-testid="read" data-menu={String(useAppMenuDeclared())} data-strip={String(useTodaysStripHidden())} />;
}

describe('shell overrides are counted', () => {
  it('the close unmounting while the room still claims both leaves both in place', () => {
    const view = render(<><Claim menu strip /><Claim menu strip /><Read /></>);
    expect(screen.getByTestId('read').dataset).toMatchObject({ menu: 'true', strip: 'true' });
    view.rerender(<><Claim menu strip /><Read /></>); // the in-room close is gone
    expect(screen.getByTestId('read').dataset).toMatchObject({ menu: 'true', strip: 'true' });
    view.rerender(<Read />);
    expect(screen.getByTestId('read').dataset).toMatchObject({ menu: 'false', strip: 'false' });
  });
});
