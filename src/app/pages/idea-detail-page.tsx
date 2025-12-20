/**
 * @file idea-detail-page.tsx
 * @description Idea Detail Page - Full view of a single idea with comments.
 * Part of P19.3: Idea Feed & Orphan Ideas.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRelativeTime } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getFeedIdea,
  getFeedUserName,
  setFeedUserName,
  voteOnIdea,
  getIdeaVoters,
  getIdeaComments,
  addIdeaComment,
  elevateCommentToIdea,
  getVoteHistory,
  type FeedIdea,
  type FeedVote,
  type IdeaVote,
  type IdeaComment,
  type IdeaVoteHistory,
} from '@/app/data/api';
import { VoteButton, NameDialog } from '@/app/components/feed';
import {
  ArrowLeft,
  Loader2,
  User,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MessageCircle,
  History,
} from 'lucide-react';

// Vote label helper
function getVoteLabel(vote: FeedVote): string {
  return { agree: 'Agreed', disagree: 'Disagreed', dont_know: "Don't Know" }[vote];
}

// Voter item with expandable history
function VoterItem({ vote }: { vote: IdeaVote }) {
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<IdeaVoteHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const handleToggleHistory = async () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }

    setLoadingHistory(true);
    try {
      const historyData = await getVoteHistory(vote.id);
      setHistory(historyData);
      setShowHistory(true);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Check if vote was changed (updatedAt differs from createdAt by more than 1 second)
  const wasChanged = new Date(vote.updatedAt).getTime() - new Date(vote.createdAt).getTime() > 1000;

  return (
    <div className="p-2 rounded hover:bg-gray-50">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
          <User className="h-4 w-4 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{vote.voterName}</p>
          <p className="text-xs text-gray-500">
            {formatRelativeTime(vote.updatedAt)}
          </p>
        </div>
        {wasChanged && (
          <button
            onClick={handleToggleHistory}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="View vote history"
          >
            {loadingHistory ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <History className="h-3 w-3" />
                <span>History</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Vote history */}
      {showHistory && history.length > 0 && (
        <div className="mt-2 ml-11 pl-3 border-l-2 border-gray-200 space-y-1">
          {history.map((h, i) => (
            <div key={h.id} className="text-xs text-gray-500">
              <span className="font-medium">
                {i === 0 ? 'Originally' : 'Changed to'}:{' '}
              </span>
              <span>{getVoteLabel(h.vote)}</span>
              <span className="ml-1">({formatRelativeTime(h.changedAt)})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Voter list modal
function VoterListModal({
  open,
  onClose,
  voters,
  voteType,
}: {
  open: boolean;
  onClose: () => void;
  voters: IdeaVote[];
  voteType: FeedVote;
}) {
  const filteredVoters = voters.filter((v) => v.vote === voteType);
  const title = getVoteLabel(voteType);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title} ({filteredVoters.length})</DialogTitle>
        </DialogHeader>
        <div className="max-h-[300px] overflow-y-auto">
          {filteredVoters.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No votes yet</p>
          ) : (
            <div className="space-y-1">
              {filteredVoters.map((vote) => (
                <VoterItem key={vote.id} vote={vote} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Comment component
function CommentItem({
  comment,
  userName,
  onElevate,
  onNeedName,
}: {
  comment: IdeaComment;
  userName: string | null;
  onElevate: (commentId: string) => Promise<void>;
  onNeedName: () => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [isElevating, setIsElevating] = useState(false);

  const handleElevate = async () => {
    if (!userName) {
      onNeedName();
      return;
    }
    setIsElevating(true);
    try {
      await onElevate(comment.id);
    } finally {
      setIsElevating(false);
    }
  };

  return (
    <div
      className="group py-3"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
          <User className="h-4 w-4 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{comment.authorName}</span>
            <span className="text-xs text-gray-500">
              {formatRelativeTime(comment.createdAt)}
            </span>
          </div>
          <p className="text-sm text-gray-700 mt-1">{comment.content}</p>
          {comment.elevatedToIdeaId && (
            <Link
              to={`/idea/${comment.elevatedToIdeaId}`}
              className="inline-flex items-center gap-1 text-xs text-blue-600 mt-1 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Elevated to idea
            </Link>
          )}
        </div>
        {showActions && !comment.elevatedToIdeaId && (
          <button
            onClick={handleElevate}
            disabled={isElevating}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
              isElevating
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
            }`}
            title="Make this an idea"
          >
            {isElevating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {isElevating ? 'Elevating...' : 'Elevate'}
          </button>
        )}
      </div>
    </div>
  );
}

// Comments section
function CommentsSection({
  comments,
  userName,
  onAddComment,
  onElevateComment,
  onNeedName,
}: {
  comments: IdeaComment[];
  userName: string | null;
  onAddComment: (content: string) => Promise<void>;
  onElevateComment: (commentId: string) => Promise<void>;
  onNeedName: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [commentInput, setCommentInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;

    if (!userName) {
      onNeedName();
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddComment(commentInput.trim());
      setCommentInput('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-6 border-t pt-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        Comments ({comments.length})
      </button>

      {isExpanded && (
        <div className="mt-4">
          {/* Comment input */}
          <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
            <Input
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              placeholder={userName ? 'Add a comment...' : 'Enter your name to comment'}
              disabled={isSubmitting}
            />
            <Button type="submit" disabled={!commentInput.trim() || isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post'}
            </Button>
          </form>

          {/* Comments list */}
          {comments.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">
              No comments yet. Be the first!
            </p>
          ) : (
            <div className="divide-y">
              {comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  userName={userName}
                  onElevate={onElevateComment}
                  onNeedName={onNeedName}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function IdeaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [idea, setIdea] = useState<FeedIdea | null>(null);
  const [voters, setVoters] = useState<IdeaVote[]>([]);
  const [comments, setComments] = useState<IdeaComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [showVoterModal, setShowVoterModal] = useState<FeedVote | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Load user name
  useEffect(() => {
    setUserName(getFeedUserName());
  }, []);

  // Load idea data
  useEffect(() => {
    async function loadData() {
      if (!id) return;

      setIsLoading(true);
      try {
        const [ideaData, votersData, commentsData] = await Promise.all([
          getFeedIdea(id),
          getIdeaVoters(id),
          getIdeaComments(id),
        ]);

        if (ideaData) {
          setIdea(ideaData);
          setVoters(votersData);
          setComments(commentsData);
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [id]);

  // Handle name submission
  const handleNameSubmit = (name: string) => {
    setFeedUserName(name);
    setUserName(name);
    setShowNameDialog(false);

    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  // Handle vote
  const handleVote = useCallback(
    async (vote: FeedVote) => {
      if (!id || !userName) return;

      setIsVoting(true);
      try {
        await voteOnIdea(id, vote, userName);
        // Refresh data
        const [ideaData, votersData] = await Promise.all([
          getFeedIdea(id),
          getIdeaVoters(id),
        ]);
        if (ideaData) {
          setIdea(ideaData);
          setVoters(votersData);
        }
      } finally {
        setIsVoting(false);
      }
    },
    [id, userName]
  );

  // Handle need name
  const handleNeedName = (action?: () => void) => {
    if (action) {
      setPendingAction(() => action);
    }
    setShowNameDialog(true);
  };

  // Handle add comment
  const handleAddComment = async (content: string) => {
    if (!id || !userName) return;

    const newComment = await addIdeaComment(id, userName, content);
    setComments((prev) => [...prev, newComment]);
  };

  // Handle elevate comment
  const handleElevateComment = async (commentId: string) => {
    if (!userName) return;

    const newIdea = await elevateCommentToIdea(commentId, userName);
    // Update the comment to show it was elevated
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId ? { ...c, elevatedToIdeaId: newIdea.id } : c
      )
    );
    // Navigate to the new idea
    navigate(`/idea/${newIdea.id}`);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!idea) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Idea not found</h1>
        <p className="text-gray-500 mb-4">This idea may have been deleted or doesn't exist.</p>
        <Link to="/feed">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Feed
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Back link */}
      <Link
        to="/feed"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Feed
      </Link>

      {/* Idea card */}
      <div className="bg-white border rounded-lg p-6 shadow-sm">
        {/* Content */}
        <p className="text-lg font-medium text-gray-900">{idea.content}</p>

        {/* Meta */}
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <span>Originated by {idea.originatorName}</span>
          <span>•</span>
          <span>{formatRelativeTime(idea.createdAt)}</span>
        </div>

        {/* Provenance */}
        {idea.provenanceType !== 'direct' && (
          <div className="mt-2 text-xs text-gray-500">
            {idea.provenanceType === 'elevated_chat' && 'Elevated from chat'}
            {idea.provenanceType === 'elevated_comment' && 'Elevated from comment'}
          </div>
        )}

        {/* Vote buttons */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <VoteButton
            type="agree"
            count={idea.agreeCount || 0}
            isActive={idea.userVote === 'agree'}
            onClick={() => {
              if (!userName) {
                handleNeedName(() => handleVote('agree'));
              } else {
                handleVote('agree');
              }
            }}
            disabled={isVoting}
            onCountClick={() => setShowVoterModal('agree')}
          />
          <VoteButton
            type="disagree"
            count={idea.disagreeCount || 0}
            isActive={idea.userVote === 'disagree'}
            onClick={() => {
              if (!userName) {
                handleNeedName(() => handleVote('disagree'));
              } else {
                handleVote('disagree');
              }
            }}
            disabled={isVoting}
            onCountClick={() => setShowVoterModal('disagree')}
          />
          <VoteButton
            type="dont_know"
            count={idea.dontKnowCount || 0}
            isActive={idea.userVote === 'dont_know'}
            onClick={() => {
              if (!userName) {
                handleNeedName(() => handleVote('dont_know'));
              } else {
                handleVote('dont_know');
              }
            }}
            disabled={isVoting}
            onCountClick={() => setShowVoterModal('dont_know')}
          />
        </div>

        {/* Discuss in Chat button */}
        <div className="mt-4">
          <Link
            to={`/chat?ideaId=${idea.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            Discuss in Chat
          </Link>
          <p className="text-xs text-gray-500 mt-1">
            Start a Clarity Chat to verify understanding
          </p>
        </div>

        {/* User indicator */}
        {userName && (
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
            <User className="h-3 w-3" />
            <span>
              Voting as <span className="font-medium">{userName}</span>
            </span>
            <button
              onClick={() => setShowNameDialog(true)}
              className="text-blue-600 hover:underline"
            >
              change
            </button>
          </div>
        )}

        {/* Comments section */}
        <CommentsSection
          comments={comments}
          userName={userName}
          onAddComment={handleAddComment}
          onElevateComment={handleElevateComment}
          onNeedName={() => handleNeedName()}
        />
      </div>

      {/* Dialogs */}
      <NameDialog
        open={showNameDialog}
        onClose={() => {
          setShowNameDialog(false);
          setPendingAction(null);
        }}
        onSubmit={handleNameSubmit}
      />

      {showVoterModal && (
        <VoterListModal
          open={true}
          onClose={() => setShowVoterModal(null)}
          voters={voters}
          voteType={showVoterModal}
        />
      )}
    </div>
  );
}
