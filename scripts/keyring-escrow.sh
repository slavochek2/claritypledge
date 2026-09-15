#!/usr/bin/env bash
# keyring-escrow.sh — P1322: the offline, encrypted recovery copy of the locked credential set.
#
#   ./scripts/keyring-escrow.sh export  /Volumes/<usb>/cp-escrow-YYYY-MM-DD.dmg
#   ./scripts/keyring-escrow.sh drill   /Volumes/<usb>/cp-escrow-YYYY-MM-DD.dmg
#   ./scripts/keyring-escrow.sh restore /Volumes/<usb>/cp-escrow-YYYY-MM-DD.dmg [KEY...]
#
# export reads every registered key (one Allow dialog each) into a new AES-256 disk image whose
# passphrase macOS asks for in its own dialog. drill proves the image restores with the env files
# unreadable. restore is the real recovery once the plaintext copies are gone (P1318).
# Details, invariants and exit codes: scripts/lib/keyring_escrow.py.
#
# Output contract: status lines never contain redirect-parseable characters (shell-safety.md).
set -euo pipefail
exec python3 "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/keyring_escrow.py" "$@"
