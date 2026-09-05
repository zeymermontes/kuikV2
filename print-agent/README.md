# Kuik print agent

A single small program that puts the POS's documents on paper: kitchen
tickets, receipts, register reports, and the cash-drawer pulse. It runs on one
computer in the restaurant — the register PC, a mini PC, a Raspberry Pi — and
reaches the printers that computer can reach.

```
POS (any device) ──► Kuik cloud queue (print_jobs) ──► agent ──► printers
POS (same PC)    ──► http://127.0.0.1:9123 ──────────► agent ──► printers
```

The first path is how an iPad at the bar prints to the kitchen. The second is
the all-in-one register: the browser on that machine hands documents to the
agent directly, so receipts and the drawer keep working with the internet
down. The POS picks the path by itself.

## Install

1. In Kuik go to **Pedidos → Impresión → Agregar agente**. Copy the token; it
   is shown once.
2. Download the binary for the machine. `build.sh` produces them; the published
   copies live in a Google Drive folder (https://drive.google.com/drive/folders/1sHQck1nZch8xO52dsdpF1jcIzjrJoHwz?usp=drive_link),
   which the dashboard links to (override with `NEXT_PUBLIC_PRINT_AGENT_URL`):

   | Machine | File |
   |---|---|
   | Windows (Intel/AMD) | `kuik-print-agent-windows-amd64.exe` |
   | Mac (Apple Silicon) | `kuik-print-agent-darwin-arm64` |
   | Mac (Intel) | `kuik-print-agent-darwin-amd64` |
   | Linux / mini PC | `kuik-print-agent-linux-amd64` |
   | Raspberry Pi (64-bit OS) | `kuik-print-agent-linux-arm64` |

3. Run it once with the token:

   ```
   kuik-print-agent --token kpa_...
   ```

   The token is saved (`%APPDATA%\Kuik\print-agent.json` on Windows,
   `~/.kuik/print-agent.json` elsewhere) and is not needed again.

   The binaries are not code-signed yet, so each OS warns once:

   - **Windows** shows "Windows protected your PC" (SmartScreen). Click
     *More info → Run anyway*. Avoiding this needs an Authenticode certificate
     and signing the `.exe` in `build.sh`.
   - **macOS** refuses to open a downloaded binary that is not notarized.
     Clear the quarantine flag before running it:
     ```
     chmod +x kuik-print-agent-darwin-arm64
     xattr -d com.apple.quarantine kuik-print-agent-darwin-arm64
     ```
     or allow it in *System Settings → Privacy & Security → Open Anyway*.
     Avoiding this needs an Apple Developer account and `notarytool`.
   - **Linux / Raspberry Pi** only needs `chmod +x`.
4. Back in Kuik, add the printers and pick this agent on each one. Press
   **Probar**: a test page should come out within a couple of seconds.

### Start with the computer

**Windows** — Task Scheduler → Create Task → trigger *At log on*, action
*Start a program* pointing at the `.exe`, and tick *Run whether user is logged
on or not* if the register auto-logs in. Or wrap it with
[NSSM](https://nssm.cc) as a service.

**macOS** — `~/Library/LaunchAgents/mx.kuik.print-agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>mx.kuik.print-agent</string>
  <key>ProgramArguments</key><array><string>/usr/local/bin/kuik-print-agent</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
```

then `launchctl load ~/Library/LaunchAgents/mx.kuik.print-agent.plist`.

**Linux / Raspberry Pi** — `/etc/systemd/system/kuik-print-agent.service`:

```ini
[Unit]
Description=Kuik print agent
After=network-online.target

[Service]
ExecStart=/usr/local/bin/kuik-print-agent
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

then `sudo systemctl enable --now kuik-print-agent`.

## Printers

**Network (most restaurants).** Ethernet or Wi-Fi thermal printers listen on
TCP port 9100. Enter the printer's IP in Kuik (`192.168.1.50`, port optional).
Give the printer a fixed IP in the router — a DHCP change is the classic
"the kitchen stopped printing" call.

**USB / Bluetooth.** Install the printer in the OS as usual, then enter its
exact name in Kuik with the *USB / del sistema* connection. On Windows the
agent writes RAW through the spooler (any driver works; "Generic / Text Only"
is fine). On macOS and Linux it uses CUPS (`lp -o raw`).

**Cash drawer.** Plug it into the receipt printer's DK port and tick *Tiene
cajón* on that printer. The pulse rides with the receipt, or alone when the
sale is cash and the cashier skips the paper.

**Paper.** 58 mm = 32 characters per line, 80 mm = 48. Wrong width shows up
as truncated amounts on the test page; change it in Kuik, no restart needed.

## Local endpoint

The agent listens on `127.0.0.1:9123` (change with `--port`). It only answers
pages served from `kuik.mx` (or `localhost` in development), and only from the
same machine. The first time the POS reaches it, Chrome asks once for
permission to access the local network; allow it.

```
GET  /status            {ok, agent, name, version, online, printers}
POST /print             {printerId, kind, doc}
```

## Troubleshooting

| Symptom | Look at |
|---|---|
| Agent shows offline in Kuik | Is the process running? Firewall blocking outbound HTTPS? |
| `token rejected` in the log | The agent was deleted in Kuik. Create a new one and re-run with `--token`. |
| Test page never arrives, job says *cannot reach 192.168…* | Printer off, or on another network / VLAN than the agent. |
| Windows: *open printer failed* | The name must match Windows' printer name exactly, spaces included. |
| Accents print as symbols | The printer ignores code page 16 (WPC1252); most honour it. Open an issue with the model. |
| `kuik-print-agent --test Cocina` | Prints a page on that printer straight from the saved config, bypassing the queue. |

## Development

```
cd print-agent
go test ./...
go run . --token kpa_... --server http://localhost:3000
```

Go 1.21 or newer, standard library only. `build.sh` cross-compiles every
target; `CGO_ENABLED=0` keeps the binaries static.
