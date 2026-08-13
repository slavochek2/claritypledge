#!/usr/bin/env bash
# Single source of truth for watched paths (P950).
# Sourced by pre-push-checks.sh and git-ops.sh cmd_ship_to_prod.
# Keep in sync with the watched-path set in .claude/commands/slava/maintain/privacy/SKILL.md.
WATCHED_PATHS="docs/ features/ .claude/commands/ CLAUDE.md README.md content/articles/ content/sifter/ supabase/migrations/"
