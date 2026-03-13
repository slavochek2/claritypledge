"""
Integration test for the full transcription pipeline.

Mocks GCS download, Whisper transcription, pyannote diarization,
and Supabase storage. Verifies the pipeline produces correct segment
structure with speaker attribution and round indices.
"""

import sys
import os
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Must set env vars before importing modules that read them at import time
os.environ["MOCK_DIARIZATION"] = "true"
os.environ["MOCK_GCS"] = "true"
os.environ["SUPABASE_URL"] = "http://localhost:54321"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-key"

from transcriber import Segment
from diarizer import DiarSegment
from merger import MergedSegment, merge_segments
from speaker_map import build_speaker_map
from round_splitter import assign_round_indices


class TestFullPipelineIntegration:
    """Test the pipeline logic without real models or network."""

    def _mock_events(self):
        return {
            "sessionCode": "test01",
            "capturedAt": "2026-03-13T12:00:00Z",
            "sessionStartedAt": 1710324000000,
            "sessionEndedAt": 1710327600000,
            "durationMs": 3600000,
            "participants": [
                {"name": "Slava", "role": "creator"},
                {"name": "Jan", "role": "joiner"},
            ],
            "uploader": {
                "supabaseUserId": "uuid-slava",
                "email": "slava@example.com",
                "name": "Slava",
            },
            "events": [
                {"type": "live_round_started", "timestamp": 0, "properties": {"round_index": 0}},
                {"type": "live_round_ended", "timestamp": 10000, "properties": {"round_index": 0}},
                {"type": "live_round_started", "timestamp": 15000, "properties": {"round_index": 1}},
                {"type": "live_round_ended", "timestamp": 25000, "properties": {"round_index": 1}},
            ],
        }

    def test_merge_and_split(self):
        """Test that transcript + diarization merge correctly and split by rounds."""
        # Simulated Whisper output
        transcript = [
            Segment("Hello Jan, let me explain.", 1000, 4000),
            Segment("Sure, go ahead.", 5000, 7000),
            Segment("Now for round two.", 16000, 19000),
            Segment("I agree with that.", 20000, 23000),
        ]

        # Simulated diarization
        diar = [
            DiarSegment("SPEAKER_00", 0, 5000),
            DiarSegment("SPEAKER_01", 5000, 10000),
            DiarSegment("SPEAKER_00", 15000, 20000),
            DiarSegment("SPEAKER_01", 20000, 25000),
        ]

        # Merge
        merged = merge_segments(transcript, diar)
        assert len(merged) == 4
        assert merged[0].speaker_id == "SPEAKER_00"
        assert merged[1].speaker_id == "SPEAKER_01"
        assert merged[2].speaker_id == "SPEAKER_00"
        assert merged[3].speaker_id == "SPEAKER_01"

        # Split by rounds
        events = self._mock_events()
        segments_with_rounds = assign_round_indices(merged, events)

        assert len(segments_with_rounds) == 4

        # Round 0 segments
        round_0 = [s for s in segments_with_rounds if s["round_index"] == 0]
        assert len(round_0) == 2

        # Round 1 segments
        round_1 = [s for s in segments_with_rounds if s["round_index"] == 1]
        assert len(round_1) == 2

    def test_speaker_map_from_metadata(self):
        """Test speaker mapping from events.json participants."""
        events = self._mock_events()
        speaker_ids = ["SPEAKER_00", "SPEAKER_01"]
        recorder_names = ["slava"]  # Single-phone recording

        mapping = build_speaker_map(
            speaker_ids=speaker_ids,
            events=events,
            recorder_names=recorder_names,
            embeddings={},
            voice_profiles=[],
        )

        assert "SPEAKER_00" in mapping
        assert "SPEAKER_01" in mapping
        # Creator (Slava) should be first
        assert mapping["SPEAKER_00"]["display_name"] == "Slava"
        assert mapping["SPEAKER_01"]["display_name"] == "Jan"
        assert mapping["SPEAKER_00"]["mapping_method"] == "metadata"

    def test_speaker_map_two_phone(self):
        """Test speaker mapping with two recorders."""
        events = self._mock_events()
        speaker_ids = ["SPEAKER_00", "SPEAKER_01"]
        recorder_names = ["jan", "slava"]  # Two phones

        mapping = build_speaker_map(
            speaker_ids=speaker_ids,
            events=events,
            recorder_names=recorder_names,
            embeddings={},
            voice_profiles=[],
        )

        assert "SPEAKER_00" in mapping
        assert "SPEAKER_01" in mapping
        # Names from recorder filenames (sorted: jan, slava)
        assert mapping["SPEAKER_00"]["display_name"] == "Jan"
        assert mapping["SPEAKER_01"]["display_name"] == "Slava"

    def test_full_segment_output_format(self):
        """Verify output matches the spec's segment JSONB format."""
        transcript = [Segment("Test utterance", 2000, 5000)]
        diar = [DiarSegment("SPEAKER_00", 0, 10000)]

        merged = merge_segments(transcript, diar)
        events = self._mock_events()
        segments = assign_round_indices(merged, events)

        # Add speaker_label as the pipeline would
        speaker_map = {"SPEAKER_00": {"display_name": "Slava"}}
        for seg in segments:
            info = speaker_map.get(seg["speaker_id"], {})
            seg["speaker_label"] = info.get("display_name", seg["speaker_id"])

        assert segments[0] == {
            "speaker_id": "SPEAKER_00",
            "speaker_label": "Slava",
            "text": "Test utterance",
            "start_ms": 2000,
            "end_ms": 5000,
            "round_index": 0,
        }

    def test_no_events_graceful(self):
        """Pipeline should handle missing events gracefully."""
        transcript = [Segment("Hello", 0, 1000)]
        diar = [DiarSegment("SPEAKER_00", 0, 2000)]

        merged = merge_segments(transcript, diar)
        segments = assign_round_indices(merged, None)

        assert len(segments) == 1
        assert segments[0]["round_index"] == 0

    def test_speaker_map_no_metadata(self):
        """Speaker map with no events/recorders uses generic labels."""
        mapping = build_speaker_map(
            speaker_ids=["SPEAKER_00", "SPEAKER_01"],
            events=None,
            recorder_names=[],
            embeddings={},
            voice_profiles=[],
        )

        assert mapping["SPEAKER_00"]["display_name"] == "Speaker 1"
        assert mapping["SPEAKER_01"]["display_name"] == "Speaker 2"
        assert mapping["SPEAKER_00"]["mapping_method"] == "unknown"
