import { useState, useEffect } from "react";
import { getInitials, getGravatarUrl } from "@/lib/utils";

interface GravatarAvatarProps {
  email?: string;
  name: string;
  size?: "sm" | "md" | "lg";
  avatarColor?: string;
  className?: string;
  /** Direct photo URL - takes priority over Gravatar */
  photoUrl?: string;
}

const sizeClasses = {
  sm: "w-10 h-10 text-sm",
  md: "w-14 h-14 text-lg",
  lg: "w-16 h-16 text-xl",
};

const sizePx = {
  sm: 80,
  md: 112,
  lg: 128,
};

export function GravatarAvatar({
  email,
  name,
  size = "md",
  avatarColor = "#0044CC",
  className = "",
  photoUrl,
}: GravatarAvatarProps) {
  const [gravatarUrl, setGravatarUrl] = useState<string | undefined>(undefined);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    // Reset error state when inputs change - allows re-attempting image load
    setImageError(false);

    // Skip Gravatar lookup if we have a direct photo URL
    if (photoUrl) {
      setGravatarUrl(undefined);
      return;
    }

    let cancelled = false;

    async function loadGravatar() {
      if (!email) {
        setGravatarUrl(undefined);
        return;
      }

      const url = await getGravatarUrl(email, sizePx[size]);
      if (!cancelled) {
        setGravatarUrl(url);
      }
    }

    loadGravatar();
    return () => { cancelled = true; };
  }, [email, size, photoUrl]);

  // photoUrl takes priority, then Gravatar
  const imageUrl = photoUrl || gravatarUrl;
  const showImage = imageUrl && !imageError;

  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 overflow-hidden ${sizeClasses[size]} ${className}`}
      style={{ backgroundColor: showImage ? "transparent" : avatarColor }}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt={`${name}'s avatar`}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}
