# VPS Connection

This project can reuse the same VPS host already used by `D:\Dev\msfs24-ai-copilot`.

Normal workflow is VPS-first. You do not need Docker running on your local PC unless you are explicitly doing local-container debugging.

## SSH Alias

The local SSH alias is configured as:

- `open-antigravity-vps`
- `msfs24-vps`

Both point to the same existing host and user.
If direct `root` SSH keys are not enabled, use `-UseSudo` in the helper script for root-owned paths.

Quick check:

```powershell
ssh open-antigravity-vps "echo VPS_OK"
```

## Helper Script

From `D:\open-antigravity`:

1. Connection check only:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\vps_connect.ps1
```

Runtime diagnostics snapshot (local + VPS):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\vps_connect.ps1 -Status
```

This shows:
- Local listeners and owning processes (including host-level services such as `ollama` when running).
- Local health checks for ports `3000`, `3100`, `4000`, `4100`, and `13100`.
- VPS listeners, Open-Antigravity containers, and VPS health checks.

2. Sync current local project files to VPS path (`/opt/open-antigravity`):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\vps_connect.ps1 -Sync -UseSudo
```

3. Sync + deploy with Docker Compose:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\vps_connect.ps1 -Sync -Deploy -UseSudo
```

After deploy, start an SSH tunnel for local browser access:

```powershell
ssh -N -L 13100:127.0.0.1:3100 open-antigravity-vps
```

Then open:
- `http://localhost:13100`

4. Deploy with Cloudflare tunnel profile enabled:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\vps_connect.ps1 -Sync -DeployTunnel -UseSudo
```

5. Sync credentials from `D:\Dev\global.env` into local `.env` and VPS `.env`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync_env_from_global.ps1 -UseSudo
```

Local-only sync:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync_env_from_global.ps1 -SkipRemote
```

## Notes

- Deployment runs `docker compose up -d --build --force-recreate` on the VPS.
- Project sync excludes `.env` so VPS credentials/ports are not overwritten by local values.
- If `.env` is missing on the VPS, `.env.example` is copied to `.env` once.
- If model calls fail with `fetch failed` but host network is healthy, check `DOCKER-USER` rules:
  - Some hosts use `DROP tcp dports 80,443` in `DOCKER-USER`.
  - Allow container egress before that rule:
    ```powershell
    ssh open-antigravity-vps "sudo -n iptables -I DOCKER-USER 1 -s 172.16.0.0/12 -p tcp -m multiport --dports 80,443 -j RETURN"
    ```
- On shared VPS hosts, keep internal ports at defaults and change host ports only:
  - `WEB_PORT=3000`
  - `ORCHESTRATOR_PORT=4000`
  - `WEB_HOST_PORT=3100` (example)
  - `ORCHESTRATOR_HOST_PORT=4100` (example)
- For Cloudflare tunnel profile:
  - Set `TUNNEL_TOKEN` in `/opt/open-antigravity/.env`.
  - Example:
    ```powershell
    ssh open-antigravity-vps "sudo -n sed -i 's/^TUNNEL_TOKEN=.*/TUNNEL_TOKEN=<your-token>/' /opt/open-antigravity/.env"
    ```
  - Start with `-DeployTunnel` (or `docker compose --profile tunnel up -d --build` on VPS).
