-- P466: Add partner_display_name column to clarity_agreements.
-- Stores the display name the creator enters for their partner at creation time.
-- Nullable (existing agreements have no value). No default. Max 100 chars.

ALTER TABLE clarity_agreements
  ADD COLUMN IF NOT EXISTS partner_display_name TEXT
  CHECK (char_length(partner_display_name) <= 100);
