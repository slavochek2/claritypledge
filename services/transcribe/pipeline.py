"""
Core orchestration: transcribe_session(session_code, session_id)

Downloads audio from GCS, decodes, transcribes with Whisper,
diarizes with pyannote, merges segments, maps speakers, stores results.

Each step is a function; failures update transcription_jobs.status = 'failed'
with error_message.
"""

import logging
import shutil
import time
from typing import Optional

from audio import download_session_audio, normalize_audio, SessionAudio
from transcriber import whisper_transcribe
from diarizer import diarize, extract_embeddings
from merger import merge_segments
from speaker_map import build_speaker_map
from round_splitter import assign_round_indices
from storage import (
    store_transcript,
    update_voice_profiles,
    update_job_status,
    route_failed_job,
    get_voice_profiles,
)
from config import WHISPER_MODEL

logger = logging.getLogger(__name__)


def transcribe_session(
    session_code: str,
    session_id: str,
    job_id: Optional[str] = None,
) -> dict:
    """
    Full transcription pipeline for a session.

    Args:
        session_code: 6-character session code (e.g., "h44q9h").
        session_id: Supabase clarity_sessions.id UUID.
        job_id: Optional transcription_jobs.id to update status.

    Returns:
        Dict with transcript_id, segment_count, language, processing_time_ms.

    Raises:
        Exception: Any pipeline failure (also recorded in job status).
    """
    t0 = time.time()
    audio: Optional[SessionAudio] = None

    def _progress(step: str):
        """Report pipeline progress — logs + DB (if job_id exists)."""
        elapsed = int(time.time() - t0)
        logger.info("=== PROGRESS [%ds] %s: %s ===", elapsed, session_code, step)
        if job_id:
            try:
                # Write current step to error_message field (repurposed as progress).
                # On success, it gets cleared. On crash, it shows the last step reached.
                update_job_status(job_id, "processing", error_message=f"step: {step} ({elapsed}s)")
            except Exception:
                pass  # Non-fatal — don't crash pipeline for progress tracking

    try:
        # Mark job as processing
        if job_id:
            update_job_status(job_id, "processing")

        # Step 1: Download and decode audio
        _progress("downloading_audio")
        audio = download_session_audio(session_code)

        if not audio.merged_wav:
            raise RuntimeError("No audio WAV produced")

        # Step 1.5: Loudness normalization — prevent Whisper hallucinations on quiet recordings
        _progress("normalizing_audio")
        try:
            audio.merged_wav = normalize_audio(audio.merged_wav)
        except Exception as e:
            logger.warning("Audio normalization failed (non-fatal, using original audio): %s", e)

        # Step 2: VAD — strip non-speech regions before Whisper
        _progress("vad_preprocessing")
        vad_wav = _apply_vad(audio.merged_wav)

        # Step 2: Transcribe with Whisper
        _progress("whisper_transcribing")
        language_hint = _get_language_hint(audio.events)
        transcript_segments, language = whisper_transcribe(
            vad_wav, language_hint=language_hint
        )

        if not transcript_segments:
            raise RuntimeError("Whisper produced no segments")

        _progress(f"whisper_done ({len(transcript_segments)} segments)")

        # Step 3: Diarize with pyannote
        _progress("diarizing")
        num_speakers = _estimate_num_speakers(audio)
        diar_segments = diarize(audio.merged_wav, num_speakers=num_speakers)

        _progress(f"diarization_done ({len(diar_segments)} segments)")

        # Step 4: Extract speaker embeddings
        _progress("extracting_embeddings")
        embeddings = extract_embeddings(audio.merged_wav, diar_segments)

        # Step 5: Merge transcript + diarization
        _progress("merging")
        merged = merge_segments(transcript_segments, diar_segments)

        # Step 6: Map speakers to users
        _progress("mapping_speakers")
        speaker_ids = list(set(s.speaker_id for s in merged))
        recorder_names = list(audio.recorder_wavs.keys())

        # Fetch existing voice profiles for matching
        participant_user_ids = _extract_user_ids(audio.events)
        existing_profiles = get_voice_profiles(participant_user_ids) if participant_user_ids else []

        speaker_map = build_speaker_map(
            speaker_ids=speaker_ids,
            events=audio.events,
            recorder_names=recorder_names,
            embeddings=embeddings,
            voice_profiles=existing_profiles,
        )

        # Step 7: Assign round indices and build segment dicts
        _progress("splitting_rounds")
        # Add speaker_label from speaker_map to merged segments
        for seg in merged:
            seg_info = speaker_map.get(seg.speaker_id, {})
            # Attach label for round_splitter output
            setattr(seg, "_speaker_label", seg_info.get("display_name", seg.speaker_id))

        segments_with_rounds = assign_round_indices(merged, audio.events)

        # Add speaker_label to each segment dict
        for seg_dict in segments_with_rounds:
            info = speaker_map.get(seg_dict["speaker_id"], {})
            seg_dict["speaker_label"] = info.get("display_name", seg_dict["speaker_id"])

        # Step 8: Store transcript
        _progress("storing_transcript")
        processing_time_ms = int((time.time() - t0) * 1000)

        transcript_id = store_transcript(
            session_id=session_id,
            session_code=session_code,
            segments=segments_with_rounds,
            speaker_map=speaker_map,
            language=language,
            model_version=WHISPER_MODEL,
            processing_time_ms=processing_time_ms,
        )

        # Step 9: Update voice profiles
        _progress("updating_voice_profiles")
        try:
            update_voice_profiles(speaker_map, embeddings, session_id)
        except Exception as e:
            # Voice profile update is non-fatal
            logger.warning("Voice profile update failed (non-fatal): %s", e)

        # Step 10: Mark job as completed (clears progress from error_message)
        _progress("complete")
        if job_id:
            update_job_status(job_id, "completed", error_message=None)

        result = {
            "transcript_id": transcript_id,
            "segment_count": len(segments_with_rounds),
            "language": language,
            "processing_time_ms": processing_time_ms,
            "speakers": list(speaker_map.keys()),
        }

        logger.info(
            "=== Pipeline complete for %s: %d segments, %s, %dms ===",
            session_code, len(segments_with_rounds), language, processing_time_ms,
        )
        return result

    except Exception as e:
        logger.error("Pipeline failed for session %s: %s", session_code, e, exc_info=True)
        if job_id:
            try:
                # P858 Decision 10 STUB: route ALL failures as PERMANENT (retryable=False →
                # status='failed') for now. The transient-vs-permanent classification — which
                # failures go back to 'pending' for sweeper auto-retry — is finalized only
                # after the 27%-failure-rate investigation (build step 7, run against prod).
                # Defaulting to permanent means no error is wrongly auto-retried before we
                # know its class: a deterministically-failing job must not burn 3 GPU attempts.
                route_failed_job(job_id, error_message=str(e), retryable=False)
            except Exception as status_err:
                logger.error("Failed to update job status: %s", status_err)
        raise

    finally:
        # Clean up temp files
        if audio and audio.tmp_dir:
            try:
                shutil.rmtree(audio.tmp_dir)
                logger.info("Cleaned up temp dir: %s", audio.tmp_dir)
            except Exception as e:
                logger.warning("Failed to clean up %s: %s", audio.tmp_dir, e)


def _estimate_num_speakers(audio: SessionAudio) -> Optional[int]:
    """
    Estimate number of speakers from session metadata.

    Two-phone recording → at least 2 speakers.
    Events.json participants → use that count.
    """
    if audio.num_recorders >= 2:
        return audio.num_recorders

    if audio.events:
        participants = audio.events.get("participants", [])
        if participants:
            return len(participants)

    return None  # Let pyannote auto-detect


def _extract_user_ids(events: Optional[dict]) -> list[str]:
    """Extract user IDs from events.json for voice profile lookup."""
    if not events:
        return []

    ids = []
    uploader = events.get("uploader", {})
    if uploader and uploader.get("supabaseUserId"):
        ids.append(uploader["supabaseUserId"])

    return ids


def _apply_vad(wav_path: str) -> str:
    """
    Apply Voice Activity Detection to strip non-speech regions.

    Returns path to a new WAV with only speech regions, or the original
    path if VAD fails or strips too much audio.
    """
    try:
        from vad import strip_silence
        result_path = strip_silence(wav_path)
        if result_path:
            return result_path
        logger.warning("VAD returned no result — using original audio")
        return wav_path
    except Exception as e:
        logger.warning("VAD failed (non-fatal, using original audio): %s", e)
        return wav_path


def _get_language_hint(events: Optional[dict]) -> Optional[str]:
    """
    Extract language hint from session metadata.

    Returns a language code (e.g., "en") if available in events.json.
    """
    if not events:
        return None
    language = events.get("language")
    if language:
        return language
    return None
