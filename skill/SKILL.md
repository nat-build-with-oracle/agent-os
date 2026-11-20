---
name: agent-os
description: Build an agent-os box — Linux VM (KVM) or DigitalOcean droplet with herdr + Claude Code + maw-cli, joined to the tailnet and registered as a herdr machine. Use when the user says "agent os", "new agent box", "VM for oracles", "droplet with claude code".
---

# /agent-os

One box that hosts oracle agents: Linux + herdr + Claude Code + maw, tailnet only.
Cloud-init: `agent-os.yaml` in this repo (put your own ssh public key in it first).
Full steps: `README.md`.

## Rules

- Changes on another box go through that box's herdr agent (`herdr --machine <m> agent prompt <pane> "…"`); ssh is for reading.
- Secrets never go in a prompt, a repo file or a log. Read them from the local password store and pipe them over ssh stdin.
- Tailscale only for reaching the box.

## Steps

1. Build: Path A (KVM `virt-install --cloud-init user-data=agent-os.yaml`) or Path B (`doctl compute droplet create … --user-data-file agent-os.yaml`).
2. Wait for `/var/lib/agent-os.ready` without a sleep loop (`herdr … agent wait`, or a background watcher).
3. `sudo tailscale up --hostname=<name> --ssh`; hand the login URL to the human.
4. Claude token in `~/.envrc` (0600) + direnv; maw-cli via bun; `"model": "sonnet"`.
5. `herdr machine add <user>@<name>.<tailnet>.ts.net --label <name>`; check `herdr --machine <name> pane list`.
6. Close public 22: `sudo ufw delete allow 22/tcp`.

## Traps

- Claude Code first-run prompts default to "No, exit": send Down, then Enter.
- No qemu-guest-agent = host cannot read the VM IP. Keep it in the yaml.
- One bot token = one body. Stop the bot elsewhere before launching it here.
