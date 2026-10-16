# clarity-agent VM

The GCP VM that runs LinkedIn Helper 2 around the clock. Until 2026-10-16 it also ran the cloud
coding agent (`/c`) and its Telegram bot; both are retired, and their doc is archived at
[../archive/cloud-agent-coding-agent.md](../archive/cloud-agent-coding-agent.md).

| Property | Value |
|----------|-------|
| Name | `clarity-agent` |
| Zone | `us-central1-a` |
| Type | `e2-standard-4` (4 vCPU, 16 GB RAM), 100 GB disk |
| OS | Ubuntu 24.04 LTS |
| SSH | `gcloud compute ssh clarity-agent --zone=us-central1-a --tunnel-through-iap` |
| Cost | ~$3/day running; disk only when stopped |

## What runs there

- **LinkedIn Helper 2**, in the `linked-helper` Docker container (its own virtual display and
  noVNC). Repo, runbook and limits: the private `linked-helper-docker` repo. Screen from the Mac:
  `cloud lh`.
- **Healer**: user timer `lh-autoheal.timer` every 15 min restarts the instance and the campaigns
  runner after a crash or reboot. **Backups**: user timer `lh-backup.timer`.
- **Postiz** (Docker), see [postiz.md](postiz.md).
- **Desktop**: `xvfb.service` (display `:99`) + XFCE4 + Chrome Remote Desktop
  (remotedesktop.google.com, personal Google account; PIN in `.env.local` as `CRD_PIN`).

## Desktop access

Connect at **remotedesktop.google.com**. You get the XFCE4 desktop and a terminal running tmux
session `main`. LinkedIn Helper itself is inside the container, so use `cloud lh` (noVNC) to see it.
