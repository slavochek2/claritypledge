-- Security fix: remove public.set_config() function
-- This SECURITY DEFINER function accepted arbitrary PostgreSQL GUC settings,
-- which could disable triggers, manipulate RLS, or escalate privileges.
-- It was created for E2E test infrastructure but should not exist in production.
DROP FUNCTION IF EXISTS public.set_config(text, text, boolean);
