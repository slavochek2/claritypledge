-- Migration: P1207 F6 — revoke TRUNCATE/REFERENCES/TRIGGER/MAINTAIN from anon + authenticated
-- Created: 2026-09-01
-- Spec: features/p1207_adversarial_permission_audit_before_agent_api.md
-- Audit: docs/audits/p1207-phase1-findings.md (finding F6)
--
-- WHY. Postgres does NOT apply row-level security to TRUNCATE. It is gated purely by the
-- table-level privilege, so every RLS policy in this schema is irrelevant to it. Measured on
-- prod 2026-09-01 via information_schema.table_privileges: anon and authenticated each hold
-- TRUNCATE on 50 public tables and TRIGGER/REFERENCES on 50 — including profiles,
-- clarity_letters, session_transcripts and clarity_sessions, tables anon cannot even SELECT.
--
-- ROOT CAUSE is one line, 20250101_initial_schema.sql:2:
--   alter default privileges in schema public grant all on tables to postgres, anon,
--     authenticated, service_role;
-- Every table created since inherited the full ALL set. P877, P880, P904 and P1104 each
-- patched a single table's column grants by hand; none revoked the class, so each new table
-- reintroduced it. This migration fixes the default AND the tables already created under it.
--
-- LATENT, NOT ARMED — stated plainly so this is not read as an incident. P1207's class-D
-- sweep established that no route reaches it: no edge function accepts a caller-supplied
-- table, column, filter or SQL string (every .from()/.rpc() argument is a string literal or
-- module constant), and schema `public` contains zero dynamic-SQL functions against a control
-- that found 8 in `realtime`, 3 in `storage`, 2 in `extensions`. The defense today is "no
-- route has been built", not "permission denied". The agent-callable API this spec gates is a
-- route-building exercise, which is exactly why the privilege is revoked before it is built.
--
-- MAINTAIN (PG17) is included: the live pg_default_acl entry is arwdDxtm, so `m` is granted to
-- future tables even though no existing table carries it (census: MAINTAIN = 0 for both roles).
-- Revoking it from the default closes that before the first table inherits it. Project is
-- PostgreSQL 17.6 on prod and major_version = 17 in supabase/config.toml, so the keyword parses.
--
-- client-safe: DML (SELECT/INSERT/UPDATE/DELETE) is untouched — only the four privileges no
-- application path uses. PostgREST issues no TRUNCATE, defines no triggers and creates no
-- foreign keys as anon or authenticated; those are DDL-adjacent privileges that only a direct
-- SQL connection could exercise, and neither role has one. postgres and service_role keep ALL.

-- 1. The default, so no future table inherits the class again.
alter default privileges in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;

-- 2. The tables already created under the old default.
revoke truncate, references, trigger, maintain
  on all tables in schema public from anon, authenticated;
