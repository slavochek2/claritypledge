/**
 * @file letters-page.tsx
 * @description P660: Letters page — single page with three tabs: Drafts, Sent, Inbox.
 * Route: /letters — tab state via ?tab=drafts|sent|inbox search param.
 */

import { useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DraftsTab } from '@/app/components/letters/drafts-tab';
import { SentTab } from '@/app/components/letters/sent-tab';
import { InboxTab } from '@/app/components/letters/inbox-tab';
import { useUnreadLetterCount } from '@/app/hooks/useUnreadLetterCount';

const VALID_TABS = ['drafts', 'sent', 'inbox'] as const;
type TabValue = (typeof VALID_TABS)[number];

export function LettersPage() {
  const navigate = useNavigate();
  const { user, isLoading, sessionChecked } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { count: unreadCount } = useUnreadLetterCount();

  // Determine active tab from URL
  const tabParam = searchParams.get('tab');
  const activeTab: TabValue =
    tabParam && VALID_TABS.includes(tabParam as TabValue)
      ? (tabParam as TabValue)
      : 'drafts';

  const handleTabChange = useCallback(
    (value: string) => {
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
          <TabsList className="sticky top-0 z-10 bg-background w-full justify-start border-b rounded-none h-auto p-0">
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
              Sent
            </TabsTrigger>
            <TabsTrigger
              value="inbox"
              aria-label={inboxAriaLabel}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:shadow-none px-4 py-3"
            >
              {inboxLabel}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="drafts" className="mt-4">
            <DraftsTab userId={user.id} />
          </TabsContent>

          <TabsContent value="sent" className="mt-4">
            <SentTab userId={user.id} />
          </TabsContent>

          <TabsContent value="inbox" className="mt-4">
            <InboxTab userId={user.id} />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
