# Clipop Agent for Android

Native Android client for [clipopai.com](https://www.clipopai.com). Built with Kotlin +
WebView (same architecture as Mac/Windows Electron clients). Loads the online web app
and bridges authentication via:

1. **Deep link** (`clipop://`) — Android intent filter receives token from web login flow
2. **Local HTTP callback** — NanoHTTPD server on 127.0.0.1 receives `POST /api/desktop-auth`
3. **JavaScript bridge** — exposes `clipopDesktop` / `vidshorterDesktop` / `electronAPI` / `agent`
   to the WebView so the web app can call `openWebLogin()`, `getAuthToken()`, etc.
4. **Token persistence** — SharedPreferences (encrypted via Android Keystore on API 23+)

## Build

GitHub Actions automatically builds the release APK on every push to `main` and uploads
to the `android-0.9.30` release tag.

Local build (requires Android SDK + JDK 17):

```bash
cd apps/android-agent
./gradlew assembleRelease
# Output: app/build/outputs/apk/release/app-release.apk
```

## Architecture

```
apps/android-agent/
├── app/
│   ├── build.gradle.kts              # Gradle build config (Android API 24+)
│   └── src/main/
│       ├── AndroidManifest.xml      # Permissions + intent filter (clipop://)
│       ├── java/com/clipop/agent/
│       │   ├── MainActivity.kt       # WebView + JS bridge setup
│       │   ├── AuthBridge.kt        # JS bridge (clipopDesktop/vidshorterDesktop/electronAPI/agent)
│       │   ├── AuthStore.kt         # Token persistence (SharedPreferences)
│       │   ├── LocalCallbackServer.kt  # NanoHTTPD server on 127.0.0.1:PORT
│       │   └── DeepLinkParser.kt    # clipop:// URL parser
│       └── res/
│           ├── mipmap-*/            # App icons (multiple densities)
│           └── values/              # Strings, themes
├── build.gradle.kts                  # Root Gradle config
├── settings.gradle.kts
├── gradle.properties
└── gradle/wrapper/                   # Gradle wrapper (committed)
```

## Login Flow

1. User taps "Sign In" in app → JS bridge calls `openWebLogin()`
2. App starts local HTTP server on random port → `http://127.0.0.1:PORT`
3. App opens system browser to `https://www.clipopai.com/login?from=desktop&callback=http://127.0.0.1:PORT&platform=android`
4. User completes email/Google OAuth login in browser
5. Web app calls `POST http://127.0.0.1:PORT/api/desktop-auth` with `{token, refreshToken, email, userId, name}`
6. Local server receives POST → saves token → broadcasts to WebView via `onAuthReceived` callback
7. WebView injects token into localStorage + calls `window.__supabaseClient.auth.setSession()`
8. User is now logged in inside the app

The `clipop://` deep link is a backup channel for cases where the local HTTP callback fails
(e.g., the browser blocks the fetch to 127.0.0.1 due to mixed-content policy).
