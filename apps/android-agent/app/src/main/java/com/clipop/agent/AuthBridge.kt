package com.clipop.agent

import android.content.Context
import android.util.Log
import android.webkit.JavascriptInterface
import android.widget.Toast

/**
 * JavaScript bridge exposed to the web app via WebView.addJavascriptInterface.
 *
 * Mirrors macos-agent/preload-web.js — exposes the same bridge objects:
 *   - clipopDesktop
 *   - vidshorterDesktop
 *   - electronAPI
 *   - agent (subset, used by isDesktopRuntime() check)
 *
 * The web app (src/lib/desktop-auth.ts) calls these to:
 *   1. Detect that it's running inside the desktop runtime
 *   2. Get the local callback URL for posting the OAuth token
 *   3. Get/clear the persisted auth token
 *   4. Open web login/register in the system browser (or in-app browser tab)
 *
 * All methods are synchronous from JS's perspective — they return String or
 * nothing. Async operations (browser launch, etc.) fire on the main thread
 * and return immediately.
 *
 * IMPORTANT: Add @JavascriptInterface to every method we want to expose.
 * Without that annotation, methods are NOT callable from JS (security feature
 * introduced in Android 4.2 / API 17).
 */
class AuthBridge(
    private val context: Context,
    private val callbackServerProvider: () -> LocalCallbackServer?,
    private val authStoreProvider: () -> AuthStore,
    private val callbacks: Callbacks,
) {

    interface Callbacks {
        /** Called when JS invokes openWebLogin/openAuth — typically launches system browser */
        fun openWebLogin()
        fun openWebRegister()
        fun openAuth()
        /** Called when JS invokes backToWeb — typically reloads the web app */
        fun backToWeb()
        /** Called when JS invokes openSettings — opens a settings dialog */
        fun openSettings()
        /** Called when JS invokes openLogs — opens a logs dialog */
        fun openLogs()
        /** Returns the application version string */
        fun getAppVersion(): String
        /** Returns the contents of the log buffer (for copyLogs) */
        fun getLogs(): String
    }

    companion object {
        private const val TAG = "AuthBridge"
    }

    // ============================================================
    // clipopDesktop / vidshorterDesktop interface (full bridge)
    // ============================================================

    @JavascriptInterface
    fun openSettings() {
        Log.d(TAG, "openSettings()")
        runOnUiThread { callbacks.openSettings() }
    }

    @JavascriptInterface
    fun openLogs() {
        Log.d(TAG, "openLogs()")
        runOnUiThread { callbacks.openLogs() }
    }

    @JavascriptInterface
    fun getAppVersion(): String {
        Log.d(TAG, "getAppVersion() -> ${callbacks.getAppVersion()}")
        return callbacks.getAppVersion()
    }

    @JavascriptInterface
    fun copyLogs() {
        Log.d(TAG, "copyLogs()")
        runOnUiThread {
            val logs = callbacks.getLogs()
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Clipop Logs", logs))
            Toast.makeText(context, "Logs copied", Toast.LENGTH_SHORT).show()
        }
    }

    @JavascriptInterface
    fun backToWeb() {
        Log.d(TAG, "backToWeb()")
        runOnUiThread { callbacks.backToWeb() }
    }

    @JavascriptInterface
    fun localGenerateHighlights(url: String): String {
        // Not implemented on Android (we route all video processing through the
        // web app's online pipeline). Returning empty string signals "no-op".
        Log.d(TAG, "localGenerateHighlights($url) — not implemented on Android, returning empty")
        return ""
    }

    @JavascriptInterface
    fun openAuth() {
        Log.d(TAG, "openAuth()")
        runOnUiThread { callbacks.openAuth() }
    }

    @JavascriptInterface
    fun openWebLogin() {
        Log.d(TAG, "openWebLogin()")
        runOnUiThread { callbacks.openWebLogin() }
    }

    @JavascriptInterface
    fun openWebRegister() {
        Log.d(TAG, "openWebRegister()")
        runOnUiThread { callbacks.openWebRegister() }
    }

    @JavascriptInterface
    fun getAuthCallbackUrl(): String {
        val server = callbackServerProvider()
        val origin = server?.callbackOrigin() ?: ""
        Log.d(TAG, "getAuthCallbackUrl() -> $origin")
        return origin
    }

    @JavascriptInterface
    fun getAuthToken(): String {
        val token = authStoreProvider().load().token
        Log.d(TAG, "getAuthToken() -> token length=${token.length}")
        return token
    }

    @JavascriptInterface
    fun clearAuthToken() {
        Log.d(TAG, "clearAuthToken()")
        authStoreProvider().clear()
    }

    @JavascriptInterface
    fun getMediaBaseUrl(): String {
        // Not implemented on Android — web app falls back to its own URLs.
        Log.d(TAG, "getMediaBaseUrl() — not implemented on Android")
        return ""
    }

    // ============================================================
    // Helper to run on UI thread (Toast, browser launch, etc.)
    // ============================================================
    private fun runOnUiThread(action: () -> Unit) {
        val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
        mainHandler.post { action() }
    }
}
