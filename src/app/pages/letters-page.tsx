/**
 * @file letters-page.tsx
 * @description P660: Letters page — single page with three tabs: Drafts, Sent, Inbox.
 * Route: /letters — tab state via ?tab=drafts|sent|inbox search param.
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Lock, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DraftsTab } from '@/app/components/letters/drafts-tab';
import { SentTab } from '@/app/components/letters/sent-tab';
import { InboxTab } from '@/app/components/letters/inbox-tab';
import { useUnreadLetterCount } from '@/app/hooks/useUnreadLetterCount';
import { useOpenLiveInvite } from '@/app/hooks/useOpenLiveInvite';
import { docsService } from '@/app/data/docs-service';
import type { ContentVisibility } from '@/app/types';

const VALID_TABS = ['drafts', 'sent', 'inbox'] as const;
type TabValue = (typeof VALID_TABS)[number];

export function LettersPage() {
  const navigate = useNavigate();
  const { user, isLoading, sessionChecked } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { count: unreadCount } = useUnreadLetterCount();
  const { invite: openInvite } = useOpenLiveInvite();
  const [creating, setCreating] = useState(false);

  // Determine active tab from URL
  // P725: default landing tab is Inbox (was Drafts) to prioritise incoming letters.
  const tabParam = searchParams.get('tab');
  const activeTab: TabValue =
    tabParam && VALID_TABS.includes(tabParam as TabValue)
      ? (tabParam as TabValue)
      : 'inbox';

  // P893: Radix TabsTrigger fires onValueChange twice per click (focus
  // activation + click) before the URL-driven re-render lands, so an
  // unguarded push creates TWO identical history entries per tab switch —
  // the browser Back button then needs two presses to leave a tab. Dedupe
  // with a ref synced on every render (covers back/forward URL changes too).
  const lastPushedTabRef = useRef(activeTab);
  lastPushedTabRef.current = activeTab;
  const handleTabChange = useCallback(
    (value: string) => {
      if (lastPushedTabRef.current === value) return;
      lastPushedTabRef.current = value as TabValue;
      setSearchParams({ tab: value }, { replace: false });
    },
    [setSearchParams]
  );

  // Auth gate
  useEffect(() => {
    if (!sessionChecked || isLoading) return;
    if (!user) {
      navigate('/login?redirect=/letters', { replace: true });
    }
  }, [user, isLoading, sessionChecked, navigate]);

  // Loading state
  if (!sessionChecked || isLoading) {
    return <ClarityPageLoader />;
  }

  // Auth redirect handled by effect
  if (!user) return null;

  const handleCreate = async (visibility: ContentVisibility) => {
    setCreating(true);
    try {
      const doc = await docsService.createDoc(visibility);
      navigate(`/letters/drafts/${doc.id}`);
    } catch {
      toast.error("Couldn't create draft.");
      setCreating(false);
    }
  };

  const inboxLabel = unreadCount > 0 ? `Inbox (${unreadCount})` : 'Inbox';
  const inboxAriaLabel = unreadCount > 0 ? `Inbox, ${unreadCount} unread` : 'Inbox';

  return (
    <main aria-label="Clarity Letters" className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Desktop title */}
        <h1 className="hidden lg:block text-xl font-semibold text-foreground mb-4">
          Clarity Letters
        </h1>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="flex items-end justify-between sticky top-0 z-10 bg-background">
            {/* P770: tab order Inbox → Drafts → Published. */}
            <TabsList className="w-auto justify-start border-b rounded-none h-auto p-0">
              <TabsTrigger
                value="inbox"
                aria-label={inboxAriaLabel}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:shadow-none px-4 py-3"
              >
                {inboxLabel}
              </TabsTrigger>
              <TabsTrigger
                value="drafts"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:shadow-none px-4 py-3"
              >
                Drafts
              </TabsTrigger>
              <TabsTrigger
                value="sent"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:shadow-none px-4 py-3"
              >
                Published
              </TabsTrigger>
            </TabsList>
            {/* P725: persistent "New Draft" CTA — visible on all three tabs, not gated by activeTab. */}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" className="bg-blue-500 hover:bg-blue-600 text-white mb-1">
                  <Plus className="w-4 h-4" />
                  New Draft
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-2">
                <button
                  onClick={() => handleCreate('private')}
                  disabled={creating}
                  className="w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                >
                  <Lock size={16} className="text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="font-medium">Private Draft</div>
                    <div className="text-xs text-muted-foreground">Only people you share with can see this</div>
                  </div>
                </button>
                <button
                  onClick={() => handleCreate('public')}
                  disabled={creating}
                  className="w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                >
                  <Globe size={16} className="text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="font-medium">Public Draft</div>
                    <div className="text-xs text-muted-foreground">Visible on your profile</div>
                  </div>
                </button>
              </PopoverContent>
            </Popover>
          </div>

          <TabsContent value="inbox" className="mt-4">
            <InboxTab userId={user.id} openInvite={openInvite} />
          </TabsContent>

          <TabsContent value="sent" className="mt-4">
            <SentTab userId={user.id} />
          </TabsContent>

          <TabsContent value="drafts" className="mt-4">
            <DraftsTab userId={user.id} />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
