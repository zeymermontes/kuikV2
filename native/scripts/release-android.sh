#!/usr/bin/env sh
# Build a signed release APK: scripts/release-android.sh terminal|mobile
# Needs JDK 21 and native/keys/keystore.properties (native/keys/README.md).
set -e
app="$1"
case "$app" in terminal|mobile) ;; *) echo "usage: $0 terminal|mobile" >&2; exit 2;; esac
cd "$(dirname "$0")/../$app"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"
npx cap sync android >/dev/null
cd android
./gradlew assembleRelease --no-daemon -q
apk="app/build/outputs/apk/release/app-release.apk"
[ -f "$apk" ] || { echo "no signed APK; is native/keys/keystore.properties in place?" >&2; ls app/build/outputs/apk/release; exit 1; }
echo "$(pwd)/$apk"
