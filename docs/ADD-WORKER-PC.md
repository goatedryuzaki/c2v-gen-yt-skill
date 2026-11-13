# Adding a new worker PC (no installs)

Any Windows PC that can reach your main machine over the LAN can join the render farm. Nothing is
installed, registered or added to PATH; when you're done you delete two folders.

You need: a USB stick (or network share), the project folder, about 5 minutes.

---

## 1. Copy the project

Copy the whole project folder — **including `node_modules`** — to the worker PC. USB is fine.

Free-space check: project without `node_modules` is tiny; with it, about 1.3 GB.

## 2. Get portable Node (no installer)

On any machine:

```
https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip
```

Extract to `C:\node` on the worker PC. `C:\node\node.exe` must exist. There is no setup wizard,
no registry entry, no admin rights required.

## 3. Configure the worker

Edit `tools\farm\start-worker.bat` on the worker PC and set:

```bat
set NODE_EXE=C:\node\node.exe
set SERVER_IP=192.168.x.x      <- IP of the coordinator PC (not a Windows name)
set SERVER_PORT=4000
set LABEL=i7-3770
set CONC=3
```

- `SERVER_IP` — how to find it: run `ipconfig` on the **coordinator** PC. Use its IPv4 address
  (e.g. `192.168.2.5`) on the network the worker is on. If the coordinator has two adapters
  (WiFi + Ethernet), use the one on the worker's side. Do **not** use the Windows name — it only
  resolves on the same subnet.
- `CONC` — Remotion's concurrent Chromium tabs. **2** for 2 cores / 4 threads, **3** for 4 cores /
  8 threads. More than that just thrashes RAM.
- `LABEL` — whatever name you want to see in the dashboard.

## 4. Start it

Double-click `tools\farm\start-worker.bat`. The console prints something like:

```
labelled:      i7-3770
renderer:      ANGLE (NVIDIA, NVIDIA GeForce GT 710 Direct3D11 vs_5_0 ps_5_0, D3D11)
server:        http://192.168.x.x:4000
registered as w1-ab12
```

**The `renderer:` line is the only test that matters.**

| It says... | Meaning |
|---|---|
| `NVIDIA ... Direct3D11` or `Intel ... Direct3D11` or `ANGLE (Intel/NVIDIA/AMD ...)` | GPU rendering, good |
| `SwiftShader`, `Microsoft Basic Render Driver`, `WARP`, `llvmpipe` | CPU rendering — dashboard marks it red |
| probe failed / no webgl | browser missing or GPU driver problem |

If you see a CPU renderer line, don't panic: the frame cap (`CONC`) still lets it work, it's just
slow. Usually the fix is to plug the monitor into the GPU instead of the motherboard, or update
the GPU driver.

## 5. Start the work

On the coordinator PC:

```bash
npm run farm
```

Open the dashboard at `http://localhost:4000`. The worker should appear within a second. Press
**Start**. Pressing **Stop** finishes the current chunk, saves progress, and stops every worker;
pressing Start again continues from where it stopped. Chunks already on disk are never
re-rendered.

---

## Networking checklist

| Your setup | Result |
|---|---|
| Same router, same subnet | Works |
| Router 2 in AP / bridge / extender mode | Works (it is one subnet) |
| Router 2 as a separate network, WAN into router 1 | Works, **but use the coordinator's IP, not its name** |
| Guest WiFi with client isolation | **Will not work**, regardless of internet plan |

Notes:

- The farm does not use the internet at all. Bandwidth per film is under 1 GB total
  (each frame is one ~450 KB HTTP POST) and connection latency does not matter.
- Before you troubleshoot anything, verify from the worker PC:
  `ping 192.168.x.x`  then  `Test-NetConnection 192.168.x.x -Port 4000` (PowerShell) — the second must say `True`.
- The coordinator's firewall needs inbound TCP 4000. If the connection fails and the firewall prompt
  was dismissed or never shown, run this once in an **admin** command prompt on the coordinator:

  ```
  netsh advfirewall firewall add rule name="Render Farm 4000" dir=in action=allow protocol=TCP localport=4000
  ```

- Wired vs WiFi does not matter.
- If the worker is behind a second router (double NAT), outbound still works and replies return via
  NAT tracking — but use the coordinator's IP on the coordinator's subnet, because the name will not
  resolve past the router.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `connection refused` | firewall on coordinator, or worker is on a different subnet | firewall rule above, or `Test-NetConnection` from the worker |
| `probe failed` | no supported browser on the worker | install nothing; use the browser it already has — Edge and Brave both work |
| machine shows but renders 0 frames | Start not pressed, or all frames already exist on the coordinator | normal behaviour — press Start; existing frames are skipped on purpose |
| all frames are blank | chunk lead missing / crashed renderer | delete the bad frames, press Start; the farm re-renders only the missing ones |
| dashboard red "software rendering" | GPU not driving the browser | use `about:gpu` to check, plug monitor into GPU, update driver |

## Uninstall

Delete the project folder copy and `C:\node`. Nothing else on the machine was modified —
no services, no scheduled tasks, no PATH changes.
