#!/usr/bin/env bash
# P147: Wrapper to run validation script with tsx from kanban
cd "$(dirname "$0")/../tools/kanban" && npx tsx scripts/validate-features.ts
