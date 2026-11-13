/**
 * @file transcribing-wave.tsx
 * @description P1529 G4: a small grey wave, moving on a CSS animation (no audio level exists for other people on the projector), shown beside each person
 * who is transcribing. Muted, the same family as the recording bar's quiet waveform. Reduced motion: the bars stand still.
 */
import { cn } from '@/lib/utils';

const BAR_HEIGHTS = ['45%', '90%', '60%', '100%', '55%'];

export function WaveBars({ className, ...rest }: { className?: string; 'aria-label': string; 'data-testid'?: string }) {
  return (
    <span role="img" className={cn('inline-flex items-center gap-[0.12em]', className)} {...rest}>
      {BAR_HEIGHTS.map((h, i) => (
        <i
          key={i}
          aria-hidden="true"
          className="block w-[0.14em] origin-center rounded-full bg-muted-foreground/70 animate-[clarity-wave_1.1s_ease-in-out_infinite] motion-reduce:animate-none"
          style={{ height: h, animationDelay: `${i * 140}ms` }}
        />
      ))}
    </span>
  );
}
