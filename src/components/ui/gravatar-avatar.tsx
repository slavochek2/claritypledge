import { useState } from "react";
import { getInitials } from "@/lib/utils";

interface GravatarAvatarProps {
  email?: string; // Kept for API compatibility, but not used
  name: string;
  size?: "sm" | "md" | "lg";
  avatarColor?: string;
  className?: string;
  /** Direct photo URL (e.g., from Google OAuth) */
  photoUrl?: string;
}

const sizeClasses = {
  sm: "w-10 h-10 text-sm",
  md: "w-14 h-14 text-lg",
  lg: "w-16 h-16 text-xl",
};

export function GravatarAvatar({
  name,
  size = "md",
  avatarColor = "#0044CC",
  className = "",
  photoUrl,
}: GravatarAvatarProps) {
  const [imageError, setImageError] = useState(false);

  // Show photo if we have a URL and it hasn't errored
  const showImage = photoUrl && !imageError;

  console.log('🔍 GravatarAvatar:', { name, photoUrl, imageError, showImage });

  return (
    <div
      className={`rounded-full flex-shrink-0 overflow-hidden ${sizeClasses[size]} ${className} ${!showImage ? 'flex items-center justify-center text-white font-bold' : ''}`}
      style={{ backgroundColor: showImage ? "transparent" : avatarColor }}
    >
      {showImage ? (
        <img
          src={photoUrl}
          alt={`${name}'s avatar`}
          className="w-full h-full object-cover block"
          onError={() => setImageError(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}
