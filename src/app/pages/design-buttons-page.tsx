/**
 * @file design-buttons-page.tsx
 * @description /tree/design-buttons — DEV-only proposal for a button rulebook. Each rule is shown
 * as right vs wrong so the founder approves by looking. Mock markup only.
 */

import { Share2, MoreHorizontal, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

function Phone({ children, label, ok }: { children: ReactNode; label: string; ok: boolean }) {
  return (
    <div className="space-y-2">
      <p className={`text-sm font-semibold ${ok ? 'text-green-700' : 'text-red-600'}`}>{ok ? '✓ ' : '✗ '}{label}</p>
      <div className="w-full max-w-[340px] rounded-2xl border border-border bg-white p-4 space-y-3 shadow-sm">{children}</div>
    </div>
  );
}

function Rule({ n, title, why, children }: { n: number; title: string; why: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t border-border pt-8">
      <div>
        <h2 className="text-2xl font-bold">{n}. {title}</h2>
        <p className="text-muted-foreground">{why}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">{children}</div>
    </section>
  );
}

const Primary = ({ children }: { children: ReactNode }) => (
  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5">{children}</Button>
);

const Body = () => (
  <>
    <p className="font-semibold">Save your story</p>
    <p className="text-sm text-muted-foreground">It stays private until you choose to share it.</p>
  </>
);

export function DesignButtonsPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold">Button rules to approve</h1>
        <p className="text-muted-foreground">
          One question decides every button: what does it do? Approve or change each rule. Prototype only.
        </p>
      </header>

      <Rule n={1} title="The step forward: filled blue, full width, bottom, only one" why="The user should never have to hunt for the next step.">
        <Phone ok label="One blue button at the bottom">
          <Body />
          <Primary>Save</Primary>
        </Phone>
        <Phone ok={false} label="Two filled buttons compete">
          <Body />
          <div className="flex gap-2">
            <Button className="flex-1 bg-blue-600 text-white">Save</Button>
            <Button className="flex-1 bg-gray-900 text-white">Save and share</Button>
          </div>
        </Phone>
      </Rule>

      <Rule n={2} title="A real alternative: white with a border, under the blue one" why="Visible and clickable, but clearly second.">
        <Phone ok label="Alternative is outlined">
          <Body />
          <Primary>Save</Primary>
          <Button variant="outline" className="w-full">Save and share</Button>
        </Phone>
        <Phone ok={false} label="Alternative in gray fill (looks disabled)">
          <Body />
          <Primary>Save</Primary>
          <Button variant="secondary" className="w-full">Save and share</Button>
        </Phone>
      </Rule>

      <Rule n={3} title="Backing out: plain text, no box" why="Cancel and Skip should be findable but never tempting.">
        <Phone ok label="Skip is quiet text">
          <Body />
          <Primary>Save</Primary>
          <Button variant="ghost" className="w-full text-muted-foreground">Not now</Button>
        </Phone>
        <Phone ok={false} label="Skip looks as important as Save">
          <Body />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1">Not now</Button>
            <Button className="flex-1 bg-blue-600 text-white">Save</Button>
          </div>
        </Phone>
      </Rule>

      <Rule n={4} title="Going somewhere else: a link, not a button" why="Buttons do things; links take you places.">
        <Phone ok label="Underlined blue link">
          <Body />
          <a className="text-sm text-blue-600 underline underline-offset-2" href="/terms">How privacy works</a>
          <Primary>Save</Primary>
        </Phone>
        <Phone ok={false} label="Navigation dressed as a button">
          <Body />
          <Button variant="outline" className="w-full">How privacy works</Button>
          <Primary>Save</Primary>
        </Phone>
      </Rule>

      <Rule n={5} title="Deleting: red text, then a confirmation" why="Red only where something is lost; never the biggest thing on screen.">
        <Phone ok label="Red text, small, at the end">
          <Body />
          <Primary>Save</Primary>
          <Button variant="ghost" className="w-full text-red-600 hover:text-red-700"><Trash2 className="w-4 h-4 mr-1" />Delete story</Button>
        </Phone>
        <Phone ok={false} label="Big red block outweighs Save">
          <Body />
          <Button variant="destructive" className="w-full">Delete story</Button>
          <Primary>Save</Primary>
        </Phone>
      </Rule>

      <Rule n={6} title="Small actions on a card: icon only, top-right" why="Share and more-options stay out of the reading path.">
        <Phone ok label="Icons in the corner">
          <div className="flex items-start justify-between">
            <p className="font-semibold">Alice Chen</p>
            <div className="flex -mr-2 -mt-2">
              <button aria-label="Share" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full"><Share2 className="w-4 h-4" /></button>
              <button aria-label="More" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full"><MoreHorizontal className="w-4 h-4" /></button>
            </div>
          </div>
          <p className="text-sm">When my co-founder said "we're aligned", we meant two different dates.</p>
        </Phone>
        <Phone ok={false} label="Labelled buttons under every card">
          <p className="font-semibold">Alice Chen</p>
          <p className="text-sm">When my co-founder said "we're aligned", we meant two different dates.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">Share</Button>
            <Button variant="outline" size="sm">More</Button>
          </div>
        </Phone>
      </Rule>

      <Rule n={7} title="Two buttons in a popup: main on the right; on phones stacked, main on top" why="Matches what phones and laptops already teach people.">
        <Phone ok label="Desktop popup">
          <p className="font-semibold">Discard changes?</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost">Keep editing</Button>
            <Button className="bg-blue-600 text-white">Discard</Button>
          </div>
        </Phone>
        <Phone ok label="Phone popup">
          <p className="font-semibold">Discard changes?</p>
          <Primary>Discard</Primary>
          <Button variant="ghost" className="w-full">Keep editing</Button>
        </Phone>
      </Rule>
    </div>
  );
}
