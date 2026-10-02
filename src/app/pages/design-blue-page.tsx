/**
 * @file design-blue-page.tsx
 * @description /tree/design-blue — DEV-only. P1308: the founder picks ONE primary blue from three
 * candidates shown on the same screens. Mock markup only.
 */

import { Check } from 'lucide-react';

const CANDIDATES = [
  { id: 'light', name: 'Light blue', token: 'blue-500', hex: '#3b82f6', hover: '#2563eb', note: 'Today on /live and ~190 places. White text contrast 3.7:1 (fails AA for small text).' },
  { id: 'medium', name: 'Medium blue', token: 'blue-600', hex: '#2563eb', hover: '#1d4ed8', note: 'What the new button rules say. Contrast 5.2:1 (passes AA).' },
  { id: 'navy', name: 'Dark navy', token: '#002B5C', hex: '#002B5C', hover: '#001f45', note: 'Meeting terms, agreements, /ready. Matches certificate frames. Contrast 14:1.' },
];

function Screen({ bg, label }: { bg: string; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 space-y-3 shadow-sm">
      <div className="flex gap-4 border-b border-border text-sm">
        <span className="pb-2 font-medium border-b-2" style={{ color: bg, borderColor: bg }}>Stories (4)</span>
        <span className="pb-2 text-muted-foreground">Points (2)</span>
      </div>
      <p className="font-semibold">Ready for your clarity meeting?</p>
      <p className="text-sm text-muted-foreground">You both agreed to explain back before replying.</p>
      <a href="/terms" className="text-sm underline underline-offset-2" style={{ color: bg }}>How it works</a>
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white" style={{ background: bg }}>
        <Check className="w-3 h-3" /> Selected
      </span>
      <button className="w-full rounded-lg py-2.5 text-sm font-semibold text-white" style={{ background: bg }}>{label}</button>
      <button className="w-full rounded-lg py-2.5 text-sm font-medium border border-border">Edit terms</button>
    </div>
  );
}

export function DesignBluePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold">Pick one blue</h1>
        <p className="text-muted-foreground">
          The same screen in each candidate: tab, link, selected chip, main button. Prototype only.
        </p>
      </header>
      <div className="grid gap-6 md:grid-cols-3">
        {CANDIDATES.map(c => (
          <div key={c.id} className="space-y-3">
            <div>
              <p className="font-semibold">{c.name} <span className="text-muted-foreground font-normal">{c.hex}</span></p>
              <p className="text-xs text-muted-foreground">{c.note}</p>
            </div>
            <Screen bg={c.hex} label="Continue" />
          </div>
        ))}
      </div>
    </div>
  );
}
