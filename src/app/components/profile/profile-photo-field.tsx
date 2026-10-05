/**
 * P1418: the Photo row at the top of Settings. Upload / Change / Remove the user's own photo.
 * Works the same for Google and email users; an uploaded photo is kept across Google sign-ins.
 */
import { useRef, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { updateProfile } from "@/app/data/api";
import { toSquareWebp, uploadAvatar, removeOldAvatars } from "@/lib/avatar-upload";
import { PHOTO_COPY } from "./profile-photo-copy";


interface ProfilePhotoFieldProps {
  userId: string;
  name: string;
  avatarUrl?: string;
  avatarColor?: string;
  avatarProvider?: string;
  isPledger: boolean;
  onChanged: () => Promise<void> | void;
}

export function ProfilePhotoField({
  userId,
  name,
  avatarUrl,
  avatarColor,
  avatarProvider,
  isPledger,
  onChanged,
}: ProfilePhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isUpload = avatarProvider === "upload";

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError(PHOTO_COPY.badType);
      return;
    }
    setBusy(true);
    try {
      let image: Blob;
      try {
        image = await toSquareWebp(file);
      } catch {
        setError(PHOTO_COPY.badType);
        return;
      }
      const { url, path } = await uploadAvatar(userId, image);
      const { error: saveError } = await updateProfile(userId, {
        avatar_url: url,
        avatar_provider: "upload",
      });
      if (saveError) throw saveError;
      await removeOldAvatars(userId, path);
      await onChanged();
    } catch {
      setError(PHOTO_COPY.failed);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy(true);
    try {
      const { error: saveError } = await updateProfile(userId, {
        avatar_url: null,
        avatar_provider: "generated",
      });
      if (saveError) throw saveError;
      await removeOldAvatars(userId);
      await onChanged();
    } catch {
      setError(PHOTO_COPY.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="block text-sm font-medium mb-2" id="photo-label">{PHOTO_COPY.label}</p>
      <div className="flex items-center gap-4" aria-labelledby="photo-label" role="group">
        <GravatarAvatar name={name} avatarColor={avatarColor} photoUrl={avatarUrl} size="lg" isPledger={isPledger} />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-10"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <>
                <Loader2Icon className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                {PHOTO_COPY.busy}
              </>
            ) : isUpload ? PHOTO_COPY.change : PHOTO_COPY.upload}
          </Button>
          {isUpload && !busy && (
            <Button type="button" variant="ghost" className="min-h-10" onClick={handleRemove}>
              {PHOTO_COPY.remove}
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          data-testid="photo-input"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
      {error && (
        <p className="text-sm text-red-500 mt-2" role="alert">{error}</p>
      )}
    </div>
  );
}
