-- P124 Code Review Fix: Sub-room update guards
-- H1: RLS UPDATE policy allows any participant to change any column.
-- These triggers enforce immutable columns and valid status transitions at the DB level,
-- preventing direct Supabase client calls from bypassing the service layer's checks.

-- ============================================
-- GUARD 1: Immutable columns
-- event_id, initiator_id, target_id must never change after creation
-- ============================================
CREATE OR REPLACE FUNCTION enforce_sub_room_immutable_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_id != OLD.event_id THEN
    RAISE EXCEPTION 'Cannot change event_id on sub-room';
  END IF;
  IF NEW.initiator_id != OLD.initiator_id THEN
    RAISE EXCEPTION 'Cannot change initiator_id on sub-room';
  END IF;
  IF NEW.target_id != OLD.target_id THEN
    RAISE EXCEPTION 'Cannot change target_id on sub-room';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_sub_room_immutable
  BEFORE UPDATE ON event_sub_rooms
  FOR EACH ROW
  EXECUTE FUNCTION enforce_sub_room_immutable_columns();

-- ============================================
-- GUARD 2: Valid status transitions only
-- pending → active | cancelled | expired
-- active  → completed | cancelled
-- terminal (completed, cancelled, expired) → nothing
-- ============================================
CREATE OR REPLACE FUNCTION enforce_sub_room_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW; -- No-op updates are fine (e.g., updating session_id without changing status)
  END IF;

  IF OLD.status = 'pending' AND NEW.status NOT IN ('active', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'Invalid status transition from pending to %', NEW.status;
  END IF;
  IF OLD.status = 'active' AND NEW.status NOT IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status transition from active to %', NEW.status;
  END IF;
  IF OLD.status IN ('completed', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'Cannot transition from terminal status %', OLD.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_sub_room_status
  BEFORE UPDATE ON event_sub_rooms
  FOR EACH ROW
  EXECUTE FUNCTION enforce_sub_room_status_transition();
