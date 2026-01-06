import { useNavigate } from 'react-router-dom';
import { Lightbulb, Check, X, CheckCircle, HelpCircle } from 'lucide-react';
import { routes } from '../config';

type ActivityFilter = 'all' | 'agreed' | 'disagreed' | 'verified';

interface EmptyStateProps {
  filter: ActivityFilter;
  isOwnProfile: boolean;
}

export function EmptyState({ filter, isOwnProfile }: EmptyStateProps) {
  const navigate = useNavigate();

  const getEmptyStateContent = () => {
    if (!isOwnProfile) {
      return {
        icon: HelpCircle,
        title: "No shared ideas yet",
        description: "This person hasn't engaged with any ideas you can see.",
      };
    }

    switch (filter) {
      case 'all':
        return {
          icon: Lightbulb,
          title: "No engaged ideas yet",
          description: "Start exploring ideas and take positions to build your intellectual journey",
          cta: "Explore Ideas",
        };
      case 'agreed':
        return {
          icon: Check,
          title: "No agreed ideas yet",
          description: "Ideas you agree with will appear here",
        };
      case 'disagreed':
        return {
          icon: X,
          title: "No disagreed ideas yet",
          description: "Ideas you disagree with will appear here",
        };
      case 'verified':
        return {
          icon: CheckCircle,
          title: "No verified ideas yet",
          description: "Complete a live verification session to see verified ideas here",
        };
      default:
        return {
          icon: HelpCircle,
          title: "No ideas found",
          description: "Try changing your filter",
        };
    }
  };

  const { icon: Icon, title, description, cta } = getEmptyStateContent();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {/* Icon */}
      <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Icon className="w-12 h-12 text-gray-400" />
      </div>

      {/* Title */}
      <h3 className="text-lg font-medium text-gray-900 mb-1 text-center">
        {title}
      </h3>

      {/* Description */}
      <p className="text-sm text-gray-500 text-center mb-6 max-w-xs">
        {description}
      </p>

      {/* CTA (optional) */}
      {cta && (
        <button
          onClick={() => navigate(routes.feed)}
          className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          {cta}
        </button>
      )}
    </div>
  );
}
