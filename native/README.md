# Kuik native apps

Three shells around the same web app at app.kuik.mx. Nothing is bundled: each
shell loads the site in a WebView (session, cookies and the service worker
behave as in a browser) and adds what a browser cannot do. The web knows which
shell it is in from a token the shell appends to the user agent
(`lib/native/shell.ts`), and reads the shell's bridge from there.

| App | Folder | Device | Adds |
|---|---|---|---|
| **Kuik Terminal** (`mx.kuik.terminal`) | [terminal/](terminal/) | Tablet, landscape, shared | Mode chooser (`/terminal`), TCP to network printers, screen never sleeps |
| **Kuik** (`mx.kuik.app`) | [mobile/](mobile/) | Phone, portrait, personal | Native push (APNs on iOS, FCM on Android) |
| **Kuik Caja** (`mx.kuik.desktop`) | [desktop/](desktop/) | Register PC | The print agent inside, customer screen on the second display, kiosk, start with the computer |

The public menu stays on the web: nobody installs an app per restaurant.

## How the pieces fit

```
                     app.kuik.mx (Next.js)
                              ▲
        ┌─────────────────────┼──────────────────────┐
        │                     │                      │
  Kuik Terminal            Kuik (phone)          Kuik Caja
  Capacitor, iOS/Android   Capacitor, iOS/Android Electron, Win/Mac/Linux
  UA: KuikTerminal/x       UA: KuikApp/x         UA: KuikDesktop/x
  plugin KuikPrinter ──►   push token ──►        spawns print-agent ──► printers
  printer :9100            /api/push/device      127.0.0.1:9123
```

- **Printing from a tablet.** `lib/pos/printing.ts` tries, in order: the
  Terminal app's socket (`native/plugins/kuik-printer`, for `network`
  printers; the WebView renders ESC/POS with `lib/pos/escpos.ts`, the twin of
  the Go renderer), the agent on this machine over loopback, the cloud queue,
  the browser dialog. A USB printer on some PC still needs that PC's agent.
- **Printing from the register PC.** Kuik Caja runs the Go agent as a child
  process with its own config under the app's user-data folder. The POS finds
  it exactly as before (loopback probe), so nothing in the web changed for
  this case. The token is asked for once, in a setup window.
- **Push on the phone.** `components/dashboard/NativePush.tsx` registers with
  the OS and posts the token to `/api/push/device` (table
  `device_push_tokens`, migration 0079). `lib/push/send.ts` fans every push
  out to web subscriptions and to device tokens: APNs for iOS
  (`lib/push/apns.ts`, a p8 key, no Firebase on iOS), FCM for Android
  (`lib/push/fcm.ts`, a service account). Both are optional; unset means
  that platform gets nothing and web push carries on.
- **Modes on the tablet.** `/terminal` asks once whether this device is the
  register, the kitchen, the host stand or the customer screen, remembers it,
  and forwards. The floating grid button (bottom right, only inside the
  Terminal app) returns to the chooser; Android's back button does too.

## Toolchain

- Node 22+, Xcode 16+ (iOS), Android Studio with SDK 36, **JDK 21** for the
  Android builds (Capacitor 8 needs it; Android Studio's bundled JBR 17 is not
  enough): `export JAVA_HOME=/opt/homebrew/opt/openjdk@21`.
- Go for the print agent (desktop).
- Running Electron from a terminal inside VS Code: unset
  `ELECTRON_RUN_AS_NODE` first (`env -u ELECTRON_RUN_AS_NODE npm start`), or
  Electron starts as plain Node.

## Terminal and mobile (Capacitor)

```sh
cd native/terminal            # or native/mobile
npm install
npx cap sync                  # links plugins into ios/ and android/
npx cap open ios              # Xcode → run on a simulator or device
npx cap open android          # Android Studio → run
```

Point a build at a local server (the iOS simulator can use localhost; a real
device needs the Mac's LAN IP):

```sh
KUIK_SERVER_URL=http://192.168.1.20:3000 npx cap sync
```

Command-line builds, as CI would run them:

```sh
# iOS, simulator, no signing
cd ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
# Android
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleDebug
```

What the generated projects carry that `cap add` does not give you (keep
these when regenerating):

- **terminal/ios** `Info.plist`: landscape only, `UIRequiresFullScreen`,
  `NSLocalNetworkUsageDescription` (iOS asks before the first TCP write to a
  printer), `WKAppBoundDomains` with `app.kuik.mx` (with
  `limitsNavigationsToAppBoundDomains` in the config this lets WKWebView run
  the site's service workers, so `/pos` opens offline). `AppDelegate.swift`:
  idle timer off.
- **terminal/android** `AndroidManifest.xml`: `sensorLandscape`.
  `MainActivity.java`: keep-screen-on flag; back button walks history, then
  opens the chooser instead of closing the app.
- **mobile/ios** `Info.plist`: portrait, `remote-notification` background
  mode, `WKAppBoundDomains`. `App.entitlements`: `aps-environment` (Xcode →
  Signing & Capabilities → Push Notifications does the same).
  `AppDelegate.swift`: forwards the APNs token to the push plugin.
- **mobile/android**: portrait. Push needs `app/google-services.json` from
  the Firebase project (git-ignored); the build applies the Google Services
  plugin only when the file exists.

Before the stores: icons and splash (`npx @capacitor/assets generate` from
`public/icons/icon-512.png`), bundle version numbers, an Apple Developer
team on both projects, and for the phone app the APNs key in `.env`
(`APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`) and the Firebase service account
(`FCM_SERVICE_ACCOUNT`). Apple's guideline 4.2 (minimum functionality) is the
review risk for a WebView app: Terminal clears it on printing and hardware;
the phone app should ship with push working.

## Publishing an Android build (kuik.mx/apps)

The download page and the in-app "new version" banner read `latest.json`
from the public `apps` bucket (migration 0080; the script also creates the
bucket if it is missing). Nothing to deploy for a new build.

```sh
cd native
sh scripts/release-android.sh terminal        # signed APK, prints its path
node scripts/publish-apk.mjs terminal <apk>    # uploads + rewrites latest.json
sh scripts/release-android.sh mobile
node scripts/publish-apk.mjs mobile <apk>
```

- Signing uses `keys/keystore.properties` and `keys/kuik-release.keystore`
  (git-ignored). Android only installs updates signed with the same key:
  back the keystore up, see [keys/README.md](keys/README.md).
- Before each release bump `versionCode` (Android refuses an update with the
  same one) and `versionName` in `android/app/build.gradle`, and keep the
  `version` constant in `capacitor.config.ts` equal to `versionName`: that is
  the value the user agent carries and the banner compares against.
- iOS "próximamente" flips to a link when `latest.json` gets an `ios.url`
  (a TestFlight public link works); the script keeps whatever is there.

## Desktop (Electron)

```sh
cd native/desktop
npm install
npm run agent                 # compiles print-agent/ for every platform into agent/
npm start                     # runs against https://app.kuik.mx
KUIK_SERVER_URL=http://localhost:3000 npm start
npm run smoke                 # starts, prints a line, quits (CI check)
npm run dist:mac | dist:win | dist:linux   # installers in dist/
```

First launch asks for the agent token (Kuik → Pedidos → Impresión → Agregar
agente); "Sin impresoras por ahora" skips it. The agent's config and log live
in the app's user-data folder (`~/Library/Application Support/kuik-desktop`
on Mac, `%APPDATA%\kuik-desktop` on Windows). The Kuik menu toggles kiosk
mode (Ctrl/Cmd+Shift+K), start with the computer, and re-opens the token
window.

When the POS opens the customer screen (`/pos/customer`), the shell puts it
full screen on the second display if there is one.

### Releasing Kuik Caja

The GitHub workflow [desktop.yml](../.github/workflows/desktop.yml) builds
the three installers on their own runners and publishes them:

```sh
# bump "version" in native/desktop/package.json, commit, then
git tag desktop-v0.1.1 && git push origin desktop-v0.1.1
```

- Installers and electron-updater's `latest*.yml` land flat under
  `apps/desktop/` in the public bucket (`scripts/publish-desktop.mjs`), and
  `latest.json` gets a `desktop` entry that kuik.mx/apps shows with one
  button per OS. An installed app checks that feed on launch and every four
  hours, downloads in the background and installs on quit.
- Repository secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the
  upload (set). Signing is optional: `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD`
  (a base64 .pfx), `MAC_CSC_LINK` + `MAC_CSC_KEY_PASSWORD` (a base64 .p12
  "Developer ID Application") with `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`
  and `APPLE_TEAM_ID` for notarization. Without them the installers are
  unsigned: Windows shows SmartScreen once, Mac needs right-click → Open, and
  the macOS build cannot update itself (Squirrel.Mac requires a signature).
- Locally, `npm run dist:mac` (or win/linux) then
  `node ../scripts/publish-desktop.mjs dist` does the same for one platform.
