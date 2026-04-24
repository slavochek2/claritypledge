import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { getChainHead } from '@/app/data/points-service-real';

interface PointSupersedeBannerProps {
  /** UUID of the immediate successor (point.supersededBy) */
  supersededById: string;
}

/**
 * P800: Banner shown at the top of a superseded point's detail page.
 * Walks the chain to find the current head and renders a jump link.
 */
export function PointSupersedeBanner({ supersededById }: PointSupersedeBannerProps) {
  const navigate = useNavigate();
  const [headId, setHeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getChainHead(supersededById).then((result) => {
      if (!cancelled) {
        setHeadId(result?.headId ?? supersededById);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [supersededById]);

  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
      <span className="font-medium">Superseded</span>
      <span className="text-blue-400 dark:text-blue-500">—</span>
      {loading ? (
        <Loader2 size={14} className="animate-spin text-blue-500" />
      ) : (
        <button
          onClick={() => navigate(`/point/${headId}`)}
          className="flex items-center gap-1 font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 underline underline-offset-2"
        >
          View current version
          <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}
