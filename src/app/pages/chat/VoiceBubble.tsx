/**
 * @file VoiceBubble.tsx
 * @description P1576 Part B: a voice note in the message list. A round play / pause button, then waveform bars that are the
 * progress and the seek control, and the time under them (elapsed while playing, the length when idle); the
 * transcript is a line under it that says Transcribing…, Transcript unavailable, or offers Show transcript.
 * Audio the 30-day retention removed reads "Audio expired" and keeps its transcript.
 */
import { useEffect, useState } from 'react';
import { Loader2, MicOff, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatAudio, ChatMessage } from '@/app/data/chat-mappers';
import { useVoicePlayer, type VoicePlayer } from '@/hooks/use-voice-player';
import { FOCUS_RING, ROUND } from './chat-kit';
import { VoiceWaveform } from './VoiceWaveform';
import { formatClock, formatDuration, transcriptView, TRANSCRIPT_STALE_MS } from './voice-view';

/** Re-renders once the 10-minute mark passes, so a "Transcribing…" that never finished turns into "unavailable" by itself. */
function useStaleCheck(pending: boolean, createdAt: string) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!pending) return;
    const wait = Date.parse(createdAt) + TRANSCRIPT_STALE_MS - Date.now() + 1000;
    if (!(wait > 0)) return;
    const timer = setTimeout(() => tick((n) => n + 1), Math.min(wait, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [pending, createdAt]);
}

function PlayButton({ player }: { player: VoicePlayer }) {
  const loading = player.state === 'loading';
  const playing = player.state === 'playing';
  const label = loading ? 'Stop loading voice message' : playing ? 'Pause voice message' : 'Play voice message';
  const Icon = loading ? Loader2 : playing ? Pause : Play;
  return (
    <button type="button" aria-label={label} aria-busy={loading || undefined} onClick={() => void player.toggle()} className={cn(ROUND, 'bg-blue-600 text-white hover:bg-blue-700', FOCUS_RING)}>
      <Icon className={cn('h-[18px] w-[18px]', loading && 'animate-spin')} aria-hidden="true" />
    </button>
  );
}

function Transcript({ audio, createdAt }: { audio: ChatAudio; createdAt: string }) {
  const [open, setOpen] = useState(false);
  const view = transcriptView(audio, createdAt);
  useStaleCheck(view.kind === 'transcribing', createdAt);
  if (view.kind === 'transcribing') {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Transcribing…
      </p>
    );
  }
  if (view.kind === 'unavailable') return <p className="mt-1 text-sm text-muted-foreground">Transcript unavailable</p>;
  if (view.kind === 'silent') return <p className="mt-1 text-sm text-muted-foreground">No speech in this voice message</p>;
  return (
    <div className="mt-1">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cn('min-h-10 rounded-lg text-sm font-semibold text-blue-700', FOCUS_RING)}>
        {open ? 'Hide transcript' : 'Show transcript'}
      </button>
      {open && <p className="whitespace-pre-wrap break-words text-[15px] leading-[22px] text-foreground" data-testid="voice-transcript">{view.text}</p>}
    </div>
  );
}

/** What stands in for the player once the audio is gone: no play control to press, just the fact and the length. */
function ExpiredRow({ durationMs }: { durationMs: number }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <MicOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Audio expired</span>
      <span data-testid="voice-duration" className="ml-auto shrink-0 tabular-nums">{formatDuration(durationMs)}</span>
    </div>
  );
}

export function VoiceBubble({ msg }: { msg: ChatMessage }) {
  const audio = msg.audio as ChatAudio;
  const player = useVoicePlayer(msg.id, audio.hasAudio);
  const expired = !audio.hasAudio || player.state === 'expired';
  // Elapsed once the playhead has moved off the start (playing, or paused partway); the whole length otherwise.
  const elapsed = (player.state === 'playing' || player.state === 'paused') && player.positionMs > 0;
  return (
    <div className="mt-1 w-72 max-w-full rounded-2xl border bg-muted/40 p-2" data-testid="voice-bubble">
      {expired ? (
        <ExpiredRow durationMs={audio.durationMs} />
      ) : (
        <div className="flex items-center gap-3">
          <PlayButton player={player} />
          <div className="min-w-0 flex-1">
            {/* The bars are the progress and the seek control; the time under them is elapsed while playing, the length when idle. */}
            <VoiceWaveform waveform={audio.audioWaveform} durationMs={audio.durationMs} positionMs={player.positionMs} onSeek={player.seek} />
            <span data-testid="voice-duration" className="block text-xs tabular-nums text-muted-foreground">
              {elapsed ? formatClock(player.positionMs) : formatDuration(audio.durationMs)}
            </span>
          </div>
        </div>
      )}
      {player.state === 'error' && <p className="mt-1 text-sm text-muted-foreground">Couldn't play. Tap play to try again.</p>}
      <Transcript audio={audio} createdAt={msg.createdAt} />
    </div>
  );
}
