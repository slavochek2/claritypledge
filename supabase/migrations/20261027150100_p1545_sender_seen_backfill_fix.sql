-- P1545: correct the back-fill in 20261027150000 (Gemini 4 Argon review).
-- That file set sender_seen_at = read_at. read_at is written once, when the recipient first opens the letter, so any
-- progress after that open (a point answered, the letter finished) is later than read_at, and those deliveries
-- would show as new to the sender on switch-on. Today's rule treats every delivery with read_at as seen, so the
-- mark that keeps today's state is the moment of switch-on. Rows the sender has marked since (sender_seen_at no
-- longer equal to read_at) are left alone; a row opened between the two files (read_at set, no sender mark) is seen, as today; rows with no read_at stay unseen, as today.
--
-- client-safe: data only, on a column no deployed client reads directly.

UPDATE public.letter_deliveries
   SET sender_seen_at = now()
 WHERE read_at IS NOT NULL
   AND (sender_seen_at IS NULL OR sender_seen_at = read_at);
