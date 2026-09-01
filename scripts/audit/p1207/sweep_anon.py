"""Class A sweep + probe control pair. READ-ONLY, TEST database only."""
import json, sys
sys.path.insert(0, "scripts/audit/p1207")
from probe_lib import load_env, probe_select, TEST_REF

TABLES = """agent_accounts ai_rate_limits badge_points clarity_agreements clarity_chat_messages
clarity_demo_rounds clarity_docs clarity_feed_ideas clarity_idea_comments
clarity_idea_vote_history clarity_idea_votes clarity_ideas clarity_letters
clarity_live_invites clarity_live_turns clarity_sessions clarity_verifications doc_stories
email_send_log event_practice_rooms event_private_info event_room_answers event_room_members
event_rsvps event_sub_rooms events letter_deliveries letter_point_responses
letter_predictions letter_response_pending letter_story_snapshots membership
ml_training_sessions organization point_position_history point_positions points profiles
ready_submissions search_rate_limits session_consents session_transcripts stories
story_explain_backs story_point_history story_points story_verifications story_versions
terms_acceptances transcribe_messages transcribe_room_members transcribe_rooms
transcription_jobs user_voice_profiles witnesses""".split()

env = load_env(".env.test.local")
url, anon = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_ANON_KEY"]
assert TEST_REF in url, f"REFUSING: not test -> {url}"

results = {}
for t in TABLES:
    results[t] = probe_select(url, anon, t)

json.dump(results, open("/tmp/p1207_anon_sweep.json", "w"), indent=1)

reach = sorted(t for t, r in results.items() if r["reachable"])
empty = sorted(t for t, r in results.items() if r["status"] == 200 and not r["rows"])
denied = sorted(t for t, r in results.items() if r["status"] not in (200, -1))
err = sorted(t for t, r in results.items() if r["status"] == -1)

print(f"env=TEST role=anon tables={len(TABLES)}")
print(f"\nANON READS ROWS ({len(reach)}):")
for t in reach: print(f"   {t:28s} rows={results[t]['rows']}")
print(f"\n200-BUT-EMPTY ({len(empty)}): {' '.join(empty)}")
print(f"\nDENIED non-200 ({len(denied)}):")
for t in denied: print(f"   {t:28s} {results[t]['status']} {results[t]['body_head'][:90]}")
if err: print(f"\nTRANSPORT ERRORS ({len(err)}): {' '.join(err)}")
