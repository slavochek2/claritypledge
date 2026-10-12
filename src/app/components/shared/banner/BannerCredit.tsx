import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { BannerCredit as Credit } from '@/lib/banner-credit';

// P1453 UI Contract: Caveat 700, rotated -2°, text 14px from the right and 8px from the bottom.
// Size 22px from md, 18px on phones, 16px below 360px: measured at 320px, the longest sig at 18px
// ran under the avatar, which overlaps the banner's lower-left by 48px.
// The button is padded to a ≥ 40px hit area and offset so the TEXT keeps those distances.
// Ink is one of two static class sets — never a colour taken from data.
const INK_CLASS: Record<Credit['ink'], string> = {
  cream: 'text-[#fff8e7] [text-shadow:0_0_3px_rgba(0,0,0,0.75),0_1px_2px_rgba(0,0,0,0.6)]',
  // Wider light halo: the ink is chosen from the corner's MEAN luma, so a dark patch inside a light
  // corner (a kimono under "af") must still read — caught by P1453 visual QA at 1280px.
  sepia: 'text-[#2a1e14] [text-shadow:0_0_2px_rgba(255,248,231,0.95),0_0_5px_rgba(255,248,231,0.9),0_0_10px_rgba(255,248,231,0.6)]',
};

/**
 * "after <artist>" over the bottom-right of an artist-style banner. Disclosure ("AI-generated
 * image after <artist>") opens on hover and keyboard focus, and toggles on tap — touch has no
 * hover. A Popover rather than a Tooltip: Radix tooltips close on touch, and the banner clips
 * anything not portalled out of it.
 */
export function BannerCredit({ credit }: { credit: Credit }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const disclosure = `AI-generated image after ${credit.artist}`;

  return (
    <Popover
      open={hovered || pinned}
      onOpenChange={(open) => {
        setPinned(open);
        if (!open) setHovered(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`after ${credit.sig} — ${disclosure}`}
          data-testid="banner-credit"
          data-ink={credit.ink}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHovered(true); }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHovered(false); }}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          className={`absolute right-[6px] bottom-[2px] z-[5] inline-flex min-h-[40px] min-w-[40px] items-end justify-end px-2 pb-[6px] font-['Caveat',cursive] text-[16px] min-[360px]:text-[18px] md:text-[22px] font-bold leading-none -rotate-2 whitespace-nowrap select-none cursor-default focus:outline-none focus-visible:ring-1 focus-visible:ring-white/80 rounded ${INK_CLASS[credit.ink]}`}
        >
          after {credit.sig}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={-6}
        className="w-auto max-w-[min(340px,calc(100vw-24px))] px-3 py-1.5 text-xs bg-primary text-primary-foreground border-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {disclosure}
      </PopoverContent>
    </Popover>
  );
}
