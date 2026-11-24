/**
 * @file SoloClarify.tsx
 * @description DEV-only exploration (/tree/solo-clarify, P1722, no spec yet): making a point without a conversation partner.
 * Four screens: Clarify in the Mirror chat, Clarify started from another chat, points as a chat shows them, and one microphone
 * with two people. `?screen=` selects a screen so each can be linked; the share rule applies to every screen. Render-only.
 */
import { Link, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FromChatScreen } from './FromChatScreen';
import { InChatScreen } from './InChatScreen';
import { MirrorScreen } from './MirrorScreen';
import { OneMicScreen } from './OneMicScreen';
import { VariantSwitch, type ShareRule } from './parts';

const SCREENS = [
  { id: 'mirror', label: '1. Alone with the Mirror' },
  { id: 'from-chat', label: '2. From a chat' },
  { id: 'in-chat', label: '3. Points in chats' },
  { id: 'one-mic', label: '4. One mic, two people' },
] as const;

type ScreenId = (typeof SCREENS)[number]['id'];

const LINK = 'inline-flex min-h-[44px] items-center text-sm text-gray-600 underline underline-offset-4';

export function SoloClarify() {
  const [params, setParams] = useSearchParams();
  const active: ScreenId = SCREENS.find(s => s.id === params.get('screen'))?.id ?? 'mirror';
  const rule: ShareRule = params.get('share') === 'people' ? 'people' : 'public-only';
  // replace: switching screens or the rule leaves one history entry, so Back leaves the page in one step
  const set = (next: { screen?: string; share?: ShareRule }) =>
    setParams({ screen: next.screen ?? active, share: next.share ?? rule }, { replace: true });
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <Link to="/tree" className={LINK}>All prototypes</Link>
        <h1 className="text-2xl font-bold text-gray-900">Make a point on your own</h1>
        <p className="mt-1 text-sm text-gray-600">
          Clarify with your Mirror without a conversation partner, choose private or public when a point is made, and share
          any point. Invented data, nothing is saved.
        </p>
        <div className="mt-4 flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-900">Share rule for private points (all screens)</span>
          <VariantSwitch<ShareRule>
            value={rule}
            onChange={v => set({ share: v })}
            options={[{ id: 'public-only', label: 'Public only' }, { id: 'people', label: 'Share with people' }]}
          />
        </div>
        <Tabs value={active} onValueChange={id => set({ screen: id })} className="mt-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            {SCREENS.map(s => <TabsTrigger key={s.id} value={s.id} className="min-h-[44px]">{s.label}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="mirror" className="mt-6"><MirrorScreen rule={rule} /></TabsContent>
          <TabsContent value="from-chat" className="mt-6"><FromChatScreen rule={rule} /></TabsContent>
          <TabsContent value="in-chat" className="mt-6"><InChatScreen rule={rule} /></TabsContent>
          <TabsContent value="one-mic" className="mt-6"><OneMicScreen rule={rule} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
