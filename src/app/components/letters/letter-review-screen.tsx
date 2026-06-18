/**
 * @file letter-review-screen.tsx
 * @description P661: Review screen — shows prediction summary, preview link, and Seal & Send.
 */

import { ExternalLink, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DocStory, LetterMode } from '@/app/types';

interface LetterReviewScreenProps {
  docId: string;
  stories: DocStory[];
  mode: LetterMode;
  emails: string[];
  receiverName: string;
  predictions: Map<string, number>;
  sealing: boolean;
  onSeal: () => void;
  onBack: () => void;
  /** P952: current responses mode selected by the author */
  responsesMode?: 'off' | 'invite';
  /** P952: called when author changes the responses mode */
  onResponsesModeChange?: (mode: 'off' | 'invite') => void;
}

export function LetterReviewScreen({
  docId,
  stories,
  mode,
  emails,
  receiverName,
  predictions,
  sealing,
  onSeal,
  onBack,
  responsesMode = 'invite',
  onResponsesModeChange,
}: LetterReviewScreenProps) {
  const displayName = mode === 'one-to-one' && receiverName
    ? receiverName
    : 'readers';

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <h2 className="text-xl font-semibold text-foreground">Ready to send</h2>

      {/* Recipient info */}
      <div className="text-sm text-muted-foreground">
        {mode === 'one-to-one' && emails.length > 0 ? (
          <p>To: {receiverName} ({emails.join(', ')})</p>
        ) : (
          <p>To: Anyone with a link</p>
        )}
        <p>{stories.length} {stories.length === 1 ? 'story' : 'stories'}</p>
      </div>

      {/* Prediction summary */}
      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {stories.map((docStory) => (
          <div key={docStory.story_id} className="px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-foreground line-clamp-1 flex-1 mr-4">
              {docStory.story.content.slice(0, 80)}{docStory.story.content.length > 80 ? '...' : ''}
            </p>
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              Your prediction: {predictions.get(docStory.story_id) ?? '—'}
            </span>
          </div>
        ))}
      </div>

      {/* P952: Responses control */}
      {onResponsesModeChange && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Responses</legend>
          <div className="flex flex-col gap-1 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="review-responses-mode"
                value="invite"
                checked={responsesMode === 'invite'}
                onChange={() => onResponsesModeChange('invite')}
                className="accent-[#0044CC]"
              />
              <span className="text-sm text-foreground">Invite — readers can explain back &amp; add stories</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="review-responses-mode"
                value="off"
                checked={responsesMode === 'off'}
                onChange={() => onResponsesModeChange('off')}
                className="accent-[#0044CC]"
              />
              <span className="text-sm text-foreground">Off — read-only letter</span>
            </label>
            <div className="flex items-center gap-2 opacity-40 cursor-not-allowed">
              <input type="radio" name="review-responses-mode" value="push" disabled />
              <span className="text-sm text-foreground">Push <span className="text-xs text-muted-foreground">— coming with P948</span></span>
            </div>
          </div>
        </fieldset>
      )}

      {/* Preview link */}
      <a
        href={`/letter/${docId}/preview`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 transition-colors"
      >
        Preview as {displayName}
        <ExternalLink className="h-3.5 w-3.5" />
      </a>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <Button variant="ghost" onClick={onBack} disabled={sealing}>
          Back
        </Button>
        <Button
          onClick={onSeal}
          disabled={sealing}
          size="lg"
          className="bg-blue-500 hover:bg-blue-600 text-white px-8"
        >
          {sealing ? (
            'Sealing...'
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Seal & Send
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
