# agent-os

One Linux box that hosts oracle agents: **herdr + Claude Code + maw-cli**, reached over **tailscale only**.
One cloud-init file builds it, either as a KVM VM on a machine you already own or as a cloud droplet.

```
 your laptop ──tailnet──▶ agent-os (Ubuntu 24.04)
                           ├─ herdr          panes, agents, `herdr --machine agent-os …`
                           ├─ claude         Claude Code, headless token, Sonnet by default
                           ├─ maw-cli        federation + `maw herdr serve` for the town UI
                           └─ ufw            deny in, allow tailscale0 (22 closed after join)
```

## What's here

| File | What it does |
|---|---|
| `agent-os.yaml` | cloud-init: user, ssh key, swap 2G, ufw, qemu-guest-agent, tailscale + herdr + Claude Code installers. Writes `/var/lib/agent-os.ready` when done |
| `skill/SKILL.md` | the `/agent-os` Claude Code skill: the same steps for an agent to run |

Before first use, put **your own** public key in `agent-os.yaml` (`ssh_authorized_keys`).

## Path A: KVM VM

```bash
img=noble-server-cloudimg-amd64.img
curl -fLO https://cloud-images.ubuntu.com/noble/current/$img
qemu-img create -f qcow2 -F qcow2 -b $PWD/$img agent-os.qcow2 40G
virt-install --connect qemu:///system --name agent-os --memory 8192 --vcpus 4 --import \
  --disk path=$PWD/agent-os.qcow2,format=qcow2,bus=virtio \
  --network network=<your-libvirt-network>,model=virtio --osinfo ubuntu24.04 \
  --cloud-init user-data=agent-os.yaml --graphics none --noautoconsole
virsh autostart agent-os
```

## Path B: DigitalOcean droplet

```bash
doctl compute droplet create agent-os --region sgp1 --size s-1vcpu-2gb \
  --image ubuntu-24-04-x64 --ssh-keys <your-key-id> --tag-names agent-os \
  --user-data-file agent-os.yaml --wait
```

Sizing: each `claude` process uses about 260–290 MB RSS, herdr 6–25 MB. A 512 MB box cannot hold two agents;
2 GB + 2 GB swap holds two or three.

## Inside the box

1. Wait for `/var/lib/agent-os.ready`.
2. `sudo tailscale up --hostname=agent-os --ssh` and open the login URL it prints.
3. Claude token, never in a repo: `~/.envrc` (mode 0600) with `export CLAUDE_CODE_OAUTH_TOKEN=…`,
   then `direnv allow ~` and `eval "$(direnv hook bash)"` in `~/.bashrc`.
4. maw-cli: `curl -fsSL https://bun.sh/install | bash && bun add -g git+https://github.com/Soul-Brews-Studio/maw-cli.git`.
5. Model: `~/.claude/settings.json` → `"model": "sonnet"`.
6. Check: `direnv exec ~ claude -p 'say ok'`, `maw version`, `herdr --version`.

## From your laptop

```bash
tailscale status | grep agent-os
herdr machine add <user>@agent-os.<your-tailnet>.ts.net --label agent-os
herdr --machine agent-os pane list
```

Then close public ssh on the box: `sudo ufw delete allow 22/tcp`. Tailnet ssh keeps working.

## Traps met for real

- First-run prompts in Claude Code ("trust this folder", "bypass permissions") default to **No, exit**. A blind Enter quits; send Down, then Enter.
- Without `qemu-guest-agent` the host cannot read the VM's IP (`Guest agent is not responding`). It is in the yaml now.
- A Discord bot body runs fine without tailscale: it only needs outbound 443. Tailscale is for reaching the box, not for the bot.
- One bot token = one running body. Stop a bot elsewhere before starting it here.

## Town UI

`maw herdr serve` on the box, then open
`https://town.buildwithoracle.com/?host=https://agent-os.<your-tailnet>.ts.net` and paste the serve token once.
The page remembers it in that browser for that host.

## library/ — books with a brain

`library/` is a small static site generator for books: chapters stay plain markdown, every passage is embedded on the
Apple Neural Engine at build time, and the landing page is a 3D meaning map you can click, explore and search by meaning.
An MCP server serves the same prebuilt vectors to agents. See [`library/README.md`](library/README.md).
GitHub Pages publishes the sample library from this repo (`.github/workflows/pages.yml`).

## License

MIT — see `LICENSE`.
