import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface SessionEndedScreenProps {
  className?: string;
}

export function SessionEndedScreen({ className }: SessionEndedScreenProps) {
  return (
    <div
      role="main"
      aria-labelledby="session-ended-heading"
      className={`flex flex-col items-center justify-center gap-6 p-8 text-center ${className ?? ''}`}
    >
      <h2 id="session-ended-heading" className="text-xl font-semibold text-foreground">
        This session has ended
      </h2>
      <Button asChild className="w-full max-w-xs" size="lg">
        <Link to="/letters">Go to Letters</Link>
      </Button>
    </div>
  );
}
