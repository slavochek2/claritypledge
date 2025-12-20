/**
 * @file idea-feed-page.tsx
 * @description Idea Feed - Public feed of orphan ideas where users can vote and comment.
 * Part of P19.3: Idea Feed & Orphan Ideas.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatRelativeTime } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getFeedIdeas,
  getFeedUserName,
  setFeedUserName,
  createFeedIdea,
  voteOnIdea,
  subscribeToFeed,
  getFeedIdea,
  type FeedIdea,
  type FeedVote,
} from '@/app/data/api';
import { VoteButton, NameDialog } from '@/app/components/feed';
import {
  MessageSquare,
  Plus,
  Loader2,
  User,
} from 'lucide-react';

// Idea card component
function IdeaCard({
  idea,
  userName,
  onVote,
  onNeedName,
}: {
  idea: FeedIdea;
  userName: string | null;
  onVote: (ideaId: string, vote: FeedVote) => Promise<void>;
  onNeedName: () => void;
}) {
  const [isVoting, setIsVoting] = useState(false);

  const handleVote = async (vote: FeedVote) => {
    if (!userName) {
      onNeedName();
      return;
    }

    setIsVoting(true);
    try {
      await onVote(idea.id, vote);
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      {/* Idea content */}
      <Link to={`/idea/${idea.id}`} className="block group">
        <p className="text-base font-medium text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-4">
          {idea.content}
        </p>
      </Link>

      {/* Meta */}
      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
        <span>Originated by {idea.originatorName}</span>
        <span>•</span>
        <span>{formatRelativeTime(idea.createdAt)}</span>
      </div>

      {/* Vote buttons */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <VoteButton
          type="agree"
          count={idea.agreeCount || 0}
          isActive={idea.userVote === 'agree'}
          onClick={() => handleVote('agree')}
          disabled={isVoting}
        />
        <VoteButton
          type="disagree"
          count={idea.disagreeCount || 0}
          isActive={idea.userVote === 'disagree'}
          onClick={() => handleVote('disagree')}
          disabled={isVoting}
        />
        <VoteButton
          type="dont_know"
          count={idea.dontKnowCount || 0}
          isActive={idea.userVote === 'dont_know'}
          onClick={() => handleVote('dont_know')}
          disabled={isVoting}
        />

        {/* Comment count */}
        <Link
          to={`/idea/${idea.id}`}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <MessageSquare className="h-4 w-4" />
          <span>{idea.commentCount || 0}</span>
        </Link>
      </div>
    </div>
  );
}

// New idea dialog
function NewIdeaDialog({
  open,
  onClose,
  onSubmit,
  userName,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (content: string) => Promise<void>;
  userName: string;
}) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(content.trim());
      setContent('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share a new idea</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's your idea?"
            className="min-h-[120px]"
            autoFocus
          />
          <p className="text-sm text-gray-500">
            Posting as <span className="font-medium">{userName}</span>
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!content.trim() || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Posting...
                </>
              ) : (
                'Post Idea'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function IdeaFeedPage() {
  const [ideas, setIdeas] = useState<FeedIdea[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [showNewIdeaDialog, setShowNewIdeaDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Load user name from localStorage
  useEffect(() => {
    setUserName(getFeedUserName());
  }, []);

  // Load initial ideas
  useEffect(() => {
    async function loadIdeas() {
      setIsLoading(true);
      try {
        const feedIdeas = await getFeedIdeas();
        setIdeas(feedIdeas);
      } finally {
        setIsLoading(false);
      }
    }
    loadIdeas();
  }, []);

  // Subscribe to realtime updates
  useEffect(() => {
    let isMounted = true; // Cleanup flag to prevent state updates after unmount

    const unsubscribe = subscribeToFeed(
      // New idea callback
      (newIdea) => {
        if (isMounted) {
          setIdeas((prev) => [newIdea, ...prev]);
        }
      },
      // Vote change callback - refetch the idea to get updated counts
      async (ideaId) => {
        try {
          const updated = await getFeedIdea(ideaId);
          if (isMounted && updated) {
            setIdeas((prev) =>
              prev.map((idea) => (idea.id === ideaId ? updated : idea))
            );
          }
        } catch (err) {
          console.error('Error fetching updated idea:', err);
          // Silently fail - the UI will still show the last known state
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Handle name submission
  const handleNameSubmit = (name: string) => {
    setFeedUserName(name);
    setUserName(name);
    setShowNameDialog(false);

    // Execute pending action if any
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  // Handle vote with optimistic update and rollback on error
  const handleVote = useCallback(
    async (ideaId: string, vote: FeedVote) => {
      if (!userName) return;

      // Find the current idea to check if this is a same-vote toggle
      const currentIdea = ideas.find((i) => i.id === ideaId);
      if (!currentIdea) return;

      // If clicking the same vote, treat as no-op (vote toggle not supported by API)
      // The API will update the vote to the same value, which is harmless but wasteful
      if (currentIdea.userVote === vote) {
        return; // Already voted this way, no change needed
      }

      // Store previous state for rollback
      const previousIdeas = ideas;

      // Optimistically update the local state
      setIdeas((prev) =>
        prev.map((idea) => {
          if (idea.id !== ideaId) return idea;

          // Adjust counts based on previous and new vote
          const prevVote = idea.userVote;
          const newCounts = { ...idea };

          // Decrement old vote count (only if there was a previous vote)
          if (prevVote === 'agree') newCounts.agreeCount = Math.max(0, (newCounts.agreeCount || 1) - 1);
          if (prevVote === 'disagree') newCounts.disagreeCount = Math.max(0, (newCounts.disagreeCount || 1) - 1);
          if (prevVote === 'dont_know') newCounts.dontKnowCount = Math.max(0, (newCounts.dontKnowCount || 1) - 1);

          // Increment new vote count
          if (vote === 'agree') newCounts.agreeCount = (newCounts.agreeCount || 0) + 1;
          if (vote === 'disagree') newCounts.disagreeCount = (newCounts.disagreeCount || 0) + 1;
          if (vote === 'dont_know') newCounts.dontKnowCount = (newCounts.dontKnowCount || 0) + 1;

          return { ...newCounts, userVote: vote };
        })
      );

      try {
        await voteOnIdea(ideaId, vote, userName);
      } catch (err) {
        console.error('Error voting:', err);
        // Rollback to previous state on error
        setIdeas(previousIdeas);
      }
    },
    [userName, ideas]
  );

  // Handle new idea creation
  const handleCreateIdea = async (content: string) => {
    if (!userName) return;

    const newIdea = await createFeedIdea(content, userName);
    // Will be added via realtime subscription, but add optimistically too
    setIdeas((prev) => {
      // Avoid duplicate if realtime already added it
      if (prev.some((i) => i.id === newIdea.id)) return prev;
      return [newIdea, ...prev];
    });
  };

  // Handle need name (for voting without name set)
  const handleNeedName = () => {
    setShowNameDialog(true);
  };

  // Handle new idea button click
  const handleNewIdeaClick = () => {
    if (!userName) {
      setPendingAction(() => () => setShowNewIdeaDialog(true));
      setShowNameDialog(true);
    } else {
      setShowNewIdeaDialog(true);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif font-bold">Idea Feed</h1>
          <p className="text-sm text-gray-500 mt-1">
            Discover ideas, vote, and discuss
          </p>
        </div>
        <Button onClick={handleNewIdeaClick} className="gap-2">
          <Plus className="h-4 w-4" />
          New Idea
        </Button>
      </div>

      {/* User name indicator */}
      {userName && (
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <User className="h-4 w-4" />
          <span>
            Voting as <span className="font-medium text-gray-700">{userName}</span>
          </span>
          <button
            onClick={() => setShowNameDialog(true)}
            className="text-blue-600 hover:underline"
          >
            change
          </button>
        </div>
      )}

      {/* Ideas list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : ideas.length === 0 ? (
        <div className="text-center py-12">
          <MessageSquare className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">No ideas yet. Be the first to share!</p>
          <Button onClick={handleNewIdeaClick} variant="outline" className="mt-4">
            Share an Idea
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              userName={userName}
              onVote={handleVote}
              onNeedName={handleNeedName}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <NameDialog
        open={showNameDialog}
        onClose={() => {
          setShowNameDialog(false);
          setPendingAction(null);
        }}
        onSubmit={handleNameSubmit}
      />

      {userName && (
        <NewIdeaDialog
          open={showNewIdeaDialog}
          onClose={() => setShowNewIdeaDialog(false)}
          onSubmit={handleCreateIdea}
          userName={userName}
        />
      )}
    </div>
  );
}
