import { UserIcon } from "lucide-react";

export function OwnerPreviewBanner() {
  return (
    <div className="bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800 py-3">
      <div className="container mx-auto max-w-5xl px-4">
        <div className="flex items-center justify-center gap-2">
          <UserIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
            Your Pledge
          </p>
        </div>
      </div>
    </div>
  );
}

