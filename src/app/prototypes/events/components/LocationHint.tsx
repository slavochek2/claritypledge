import { MapPin, Video, Map, AlertTriangle, Info } from 'lucide-react';
import { classifyLocation } from '../location-utils';

interface LocationHintProps {
  value: string;
}

export function LocationHint({ value }: LocationHintProps) {
  if (!value || value.trim().length < 3) return null;

  const { type, hint } = classifyLocation(value);

  if (hint) {
    return (
      <p className={`text-xs mt-1 flex items-center gap-1 ${hint.level === 'warning' ? 'text-amber-600' : 'text-muted-foreground'}`}>
        {hint.level === 'warning'
          ? <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          : <Info className="w-3 h-3 flex-shrink-0" />
        }
        {hint.text}
      </p>
    );
  }

  const neutralHints: Record<string, { icon: React.ReactNode; text: string }> = {
    virtual: { icon: <Video className="w-3 h-3 flex-shrink-0" />, text: 'Virtual link — attendees will get a direct join link' },
    maps: { icon: <Map className="w-3 h-3 flex-shrink-0" />, text: 'Google Maps link — will open directly' },
    address: { icon: <MapPin className="w-3 h-3 flex-shrink-0" />, text: 'Address — will link to Google Maps' },
  };

  // Only show neutral hint if it looks like a URL (not plain text addresses)
  const isUrl = value.trim().startsWith('http://') || value.trim().startsWith('https://');
  if (!isUrl && type === 'address') return null;

  const { icon, text } = neutralHints[type];
  return (
    <p className="text-xs mt-1 text-muted-foreground flex items-center gap-1">
      {icon}
      {text}
    </p>
  );
}
