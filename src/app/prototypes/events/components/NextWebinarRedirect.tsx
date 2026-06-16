import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { eventsService } from '@/app/data/events-service';
import { filterWebinarSeries } from '@/app/data/webinar-series';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';

/** Redirects to the next upcoming Lost Co-Founders webinar, or falls back to the series list. */
export function NextWebinarRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const now = new Date();
    eventsService.getUpcomingEvents()
      .then(events => {
        const next = filterWebinarSeries(events).find(e => new Date(e.datetime) > now);
        if (next) {
          navigate(`/events/${next.slug}`, { replace: true });
        } else {
          navigate('/events/list?series=lost-cofounders', { replace: true });
        }
      })
      .catch(() => {
        navigate('/events/list?series=lost-cofounders', { replace: true });
      });
  }, [navigate]);

  return <ClarityPageLoader />;
}
