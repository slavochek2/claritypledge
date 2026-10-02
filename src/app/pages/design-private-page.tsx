/**
 * @file design-private-page.tsx
 * @description /tree/design-private — DEV-only A/B for two design-system decisions:
 * (1) what replaces amber as the "private" signal, (2) whether certificates keep their own
 * paper palette. Mock markup only; no live component is changed by this page.
 */

import { Lock, Globe } from 'lucide-react';
import type { ReactNode } from 'react';

type Variant = 'now' | 'a' | 'b';

const VARIANTS: { id: Variant; title: string; note: string }[] = [
  { id: 'now', title: 'Now (amber)', note: 'What ships today. Amber is banned by the design system.' },
  { id: 'a', title: 'A: gray tint + lock', note: 'Recommended. Private reads as "info", the lock carries the meaning.' },
  { id: 'b', title: 'B: lock only', note: 'Private cards look like every other card except for the lock.' },
];

function StoryCard({ variant }: { variant: Variant }) {
  const border = variant === 'now' ? 'border-l-amber-400' : variant === 'a' ? 'border-l-gray-400' : 'border-l-blue-500';
  const bg = variant === 'now' ? 'bg-amber-50/50' : variant === 'a' ? 'bg-muted/60' : 'bg-white';
  return (
    <div className={`rounded-lg shadow-sm border-l-4 ${border} border border-border ${bg} p-4 space-y-2`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Alice Chen</span>
        <span>·</span>
        <span className="inline-flex items-center gap-1">
          <Lock className="w-3 h-3" /> Private
        </span>
      </div>
      <p className="text-sm">
        When my co-founder said "we're aligned", I later learned we meant two different launch dates.
      </p>
    </div>
  );
}

function PublicCard() {
  return (
    <div className="rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-border bg-white p-4 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Alice Chen</span>
        <span>·</span>
        <span className="inline-flex items-center gap-1"><Globe className="w-3 h-3" /> Public</span>
      </div>
      <p className="text-sm">A public story, for comparison. Unchanged in every option.</p>
    </div>
  );
}

function Banner({ variant }: { variant: Variant }) {
  const box =
    variant === 'now' ? 'bg-amber-50 border-amber-200' : variant === 'a' ? 'bg-muted border-border' : 'bg-white border-border';
  const icon = variant === 'now' ? 'text-amber-600' : 'text-foreground';
  const label = variant === 'now' ? 'text-amber-800' : 'text-foreground';
  const rest = variant === 'now' ? 'text-amber-700' : 'text-muted-foreground';
  return (
    <div className={`w-full px-4 py-2 flex items-center justify-center gap-2 text-sm border rounded-md ${box}`}>
      <Lock size={14} className={`${icon} flex-shrink-0`} />
      <span className={`${label} font-medium`}>PRIVATE</span>
      <span className={rest}>· Only people you share with can see this</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Paper({ accent, label }: { accent: string; label: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div
        className="rounded-lg p-6 bg-[#FDFBF7]"
        style={{ border: '8px solid #002B5C', outline: '2px solid #002B5C', outlineOffset: '-12px' }}
      >
        <h3 className="text-2xl text-center text-[#1A1A1A]" style={{ fontFamily: '"Playfair Display", Georgia, serif' }}>
          The Clarity Pledge
        </h3>
        <p className="mt-4 text-lg font-bold" style={{ color: accent }}>My Commitment</p>
        <p className="text-[#1A1A1A]">I will check that I understood you before I respond.</p>
      </div>
    </div>
  );
}

export function DesignPrivatePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-16">
      <header className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold">Design decisions to approve</h1>
        <p className="text-muted-foreground">Prototype only. Nothing on this page changes the live app.</p>
      </header>

      <Section title="1. What should &quot;private&quot; look like?">
        <p className="text-muted-foreground">
          Same story card and document banner, three ways. The public card at the bottom stays as it is.
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          {VARIANTS.map(v => (
            <div key={v.id} className="space-y-3">
              <div>
                <p className="font-semibold">{v.title}</p>
                <p className="text-xs text-muted-foreground">{v.note}</p>
              </div>
              <StoryCard variant={v.id} />
              <Banner variant={v.id} />
            </div>
          ))}
        </div>
        <div className="max-w-sm"><PublicCard /></div>
      </Section>

      <Section title="2. Certificates: keep their own paper colours?">
        <p className="text-muted-foreground">
          Recommendation: keep the paper look (cream, navy frame, near-black ink) as a documented exception.
          The only open detail is the heading blue: today it is a custom blue, not the app blue.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <Paper accent="#0044CC" label="Before: custom certificate blue" />
          <Paper accent="#2563eb" label="Approved: app blue" />
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          {[
            ['#FDFBF7', 'Paper'],
            ['#002B5C', 'Navy frame'],
            ['#1A1A1A', 'Ink'],
            ['#0044CC', 'Certificate blue'],
            ['#2563eb', 'App blue'],
          ].map(([hex, name]) => (
            <div key={hex} className="flex items-center gap-2">
              <span className="w-6 h-6 rounded border border-border" style={{ background: hex }} />
              <span>{name} <span className="text-muted-foreground">{hex}</span></span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
