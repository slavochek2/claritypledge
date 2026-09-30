import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LetterReviewScreen } from '@/app/components/letters/letter-review-screen';

// New letters default to "Just read" (responses_mode 'off'); explain-back is opt-in.
describe('responses mode default', () => {
  it('review screen preselects "Just read" when no mode is passed', () => {
    render(
      <LetterReviewScreen
        docId="d1"
        stories={[]}
        mode="one-to-many"
        emails={[]}
        receiverName=""
        predictions={new Map()}
        sealing={false}
        onSeal={() => {}}
        onBack={() => {}}
        onResponsesModeChange={() => {}}
      />
    );
    expect((screen.getByRole('radio', { name: /Just read the letter/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: /explain your stories back/ }) as HTMLInputElement).checked).toBe(false);
  });
});
