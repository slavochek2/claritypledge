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

from audio import download_session_audio, SessionAudio
from transcriber import whisper_transcribe
from diarizer import diarize, extract_embeddings
from merger import merge_segments
from speaker_map import build_speaker_map
from round_splitter import assign_round_indices
from storage import (
    store_transcript,
    update_voice_profiles,
    update_job_status,
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

    try:
        # Mark job as processing
        if job_id:
            update_job_status(job_id, "processing")

        # Step 1: Download and decode audio
        logger.info("=== Step 1: Download audio for session %s ===", session_code)
        audio = download_session_audio(session_code)

        if not audio.merged_wav:
            raise RuntimeError("No audio WAV produced")

        # Step 2: Transcribe with Whisper
        logger.info("=== Step 2: Transcribe with Whisper ===")
        transcript_segments, language = whisper_transcribe(audio.merged_wav)

        if not transcript_segments:
            raise RuntimeError("Whisper produced no segments")

        # Step 3: Diarize with pyannote
        logger.info("=== Step 3: Diarize speakers ===")
        num_speakers = _estimate_num_speakers(audio)
        diar_segments = diarize(audio.merged_wav, num_speakers=num_speakers)

        # Step 4: Extract speaker embeddings
        logger.info("=== Step 4: Extract speaker embeddings ===")
        embeddings = extract_embeddings(audio.merged_wav, diar_segments)

        # Step 5: Merge transcript + diarization
        logger.info("=== Step 5: Merge transcript with diarization ===")
        merged = merge_segments(transcript_segments, diar_segments)

        # Step 6: Map speakers to users
        logger.info("=== Step 6: Map speakers to users ===")
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
        logger.info("=== Step 7: Split by rounds ===")
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
        logger.info("=== Step 8: Store transcript ===")
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
        logger.info("=== Step 9: Update voice profiles ===")
        try:
            update_voice_profiles(speaker_map, embeddings, session_id)
        except Exception as e:
            # Voice profile update is non-fatal
            logger.warning("Voice profile update failed (non-fatal): %s", e)

        # Step 10: Mark job as completed
        if job_id:
            update_job_status(job_id, "completed")

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
                update_job_status(job_id, "failed", error_message=str(e))
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
