import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

/**
 * Banner displayed when the user is offline.
 * Shows at the top of the page with a subtle warning style.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus()

  if (isOnline) {
    return null
  }

  return (
    <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2">
      <div className="max-w-4xl mx-auto flex items-center justify-center gap-2 text-sm text-yellow-800">
        <WifiOff className="h-4 w-4" />
        <span>You're offline. Some features may be unavailable.</span>
      </div>
    </div>
  )
}
