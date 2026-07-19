package com.clipop.agent

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject

/**
 * Main Activity — hosts the WebView that loads https://www.clipopai.com.
 *
 * Mirrors macos-agent/main.js's webWindow:
 *   - Single WebView with JS + DOM storage + cookies
 *   - JavaScript bridge exposing clipopDesktop/vidshorterDesktop/electronAPI/agent
 *   - Local HTTP callback server on 127.0.0.1 (LocalCallbackServer)
 *   - Deep link receiver for clipop://login-success?... (AndroidManifest intent-filter)
 *   - Token injection on page load (mirrors injectAuthToWebWindow)
 *
 * The OAuth flow is:
 *   1. User taps "Sign in" in the web app
 *   2. Web app calls clipopDesktop.openWebLogin()
 *   3. We launch Chrome Custom Tab pointing to /login?from=desktop&callback=http://127.0.0.1:PORT
 *   4. User signs in; web app POSTs the token to http://127.0.0.1:PORT/api/desktop-auth
 *   5. LocalCallbackServer receives POST and calls onAuthReceived()
 *   6. We persist the token + inject it into the WebView
 *   7. Web app dispatches 'clipop-desktop-login' event and updates UI
 */
class MainActivity : AppCompatActivity(), AuthBridge.Callbacks {

    companion object {
        private const val TAG = "MainActivity"
        private const val WEB_APP_URL = "https://www.clipopai.com"
        private const val WEB_LOGIN_PATH = "/login?from=desktop"
        private const val WEB_REGISTER_PATH = "/register?from=desktop"
        private const val WEB_AUTH_PATH = "/auth/callback?from=desktop"

        /** Saved instance state key — preserves pending deep link across config changes */
        private const val STATE_PENDING_DEEPLINK = "pending_deeplink"
    }

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var authBridge: AuthBridge
    private lateinit var authStore: AuthStore
    private var callbackServer: LocalCallbackServer? = null

    /** Token we most recently injected — used to skip redundant re-injections. */
    private var lastInjectedToken: String = ""

    /** Pending deep link that arrived before WebView finished initial load. */
    private var pendingDeepLink: String? = null

    /** Whether the WebView has finished its first page load. */
    private var pageLoaded: Boolean = false

    /** Log buffer for openLogs()/copyLogs() — mirrors appendLog() in macos-agent. */
    private val logBuffer = mutableListOf<String>()

    private val mainHandler = Handler(Looper.getMainLooper())

    // ============================================================
    // Lifecycle
    // ============================================================

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.i(TAG, "onCreate")

        // Edge-to-edge layout (transparent status bar so the WebView fills the screen)
        WindowCompat.setDecorFitsSystemWindows(window, true)
        WindowInsetsControllerCompat(window, window.decorView)
            .isAppearanceLightStatusBars = false

        // Build container: WebView + ProgressBar (top of screen)
        val container = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(Color.WHITE)
        }

        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
            visibility = View.GONE
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                12,
            ).apply { topMargin = 0 }
        }

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(Color.WHITE)
        }
        container.addView(webView)
        container.addView(progressBar)
        setContentView(container)

        // Initialize stores + bridge + callback server
        authStore = AuthStore.get(this)
        authBridge = AuthBridge(
            context = this,
            callbackServerProvider = { callbackServer },
            authStoreProvider = { authStore },
            callbacks = this,
        )

        startCallbackServer()
        configureWebView()

        // Handle the intent that launched this Activity (deep link via clipop://)
        intent?.let { handleIntent(it) }

        // Restore pending deep link on rotation
        savedInstanceState?.getString(STATE_PENDING_DEEPLINK)?.let { pendingDeepLink = it }

        // Back button: WebView goBack() if possible, else finish()
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        appendLog("[MainActivity] onCreate complete")
    }

    override fun onDestroy() {
        super.onDestroy()
        callbackServer?.stopServer()
        webView.apply {
            stopLoading()
            removeAllViews()
            destroy()
        }
        appendLog("[MainActivity] onDestroy")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        pendingDeepLink?.let { outState.putString(STATE_PENDING_DEEPLINK, it) }
    }

    // ============================================================
    // Intent / Deep link handling
    // ============================================================

    private fun handleIntent(intent: Intent) {
        val action = intent.action ?: return
        appendLog("[Intent] action=$action data=${intent.data}")

        if (action == Intent.ACTION_VIEW) {
            val data = intent.dataString
            val payload = DeepLinkParser.parse(data)
            if (payload != null) {
                appendLog("[Intent] Deep link payload received (email=${payload.email})")
                onAuthReceived(payload, source = "deep-link")
            } else {
                appendLog("[Intent] Deep link parse failed for $data")
            }
        }
    }

    // ============================================================
    // AuthBridge.Callbacks
    // ============================================================

    override fun openSettings() {
        AlertDialog.Builder(this)
            .setTitle("Clipop Agent")
            .setMessage("Version: ${BuildConfig.VERSION_NAME}\n\nServer: $WEB_APP_URL\nCallback: ${callbackServer?.callbackOrigin() ?: "(none)"}")
            .setPositiveButton("OK", null)
            .show()
    }

    override fun openLogs() {
        val logs = getLogs()
        AlertDialog.Builder(this)
            .setTitle("Logs")
            .setMessage(logs.takeLast(4000))
            .setPositiveButton("OK", null)
            .show()
    }

    override fun getAppVersion(): String = BuildConfig.VERSION_NAME

    override fun getLogs(): String = logBuffer.joinToString("\n")

    override fun backToWeb() {
        webView.loadUrl(WEB_APP_URL)
    }

    override fun openAuth() {
        openCustomTab(WEB_AUTH_PATH)
    }

    override fun openWebLogin() {
        openCustomTab(WEB_LOGIN_PATH)
    }

    override fun openWebRegister() {
        openCustomTab(WEB_REGISTER_PATH)
    }

    // ============================================================
    // WebView setup
    // ============================================================

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.apply {
            // Add JavaScript bridge — same object exposed under 4 names so the
            // web app's isDesktopRuntime() check works regardless of which name
            // it probes.
            addJavascriptInterface(authBridge, "clipopDesktop")
            addJavascriptInterface(authBridge, "vidshorterDesktop")
            addJavascriptInterface(authBridge, "electronAPI")
            addJavascriptInterface(authBridge, "agent")

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true        // localStorage
                databaseEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                loadWithOverviewMode = true
                useWideViewPort = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(false)
                mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                userAgentString = "$userAgentString ClipopAgent/${BuildConfig.VERSION_NAME} (Android ${Build.VERSION.RELEASE})"
            }

            // Cookies — enable third-party cookies so cross-origin fetch from
            // https://www.clipopai.com to http://127.0.0.1 (callback) works.
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url.toString()
                    // Keep https://www.clipopai.com navigations inside the WebView.
                    // Open everything else in the system browser.
                    val uri = request.url
                    val isInternal = uri.host?.let { host ->
                        host == "www.clipopai.com" || host == "clipopai.com"
                    } ?: false
                    if (isInternal) return false

                    // Special case: clipop:// deep links should open our own app
                    if (uri.scheme?.lowercase() == "clipop") {
                        val payload = DeepLinkParser.parse(uri)
                        if (payload != null) {
                            onAuthReceived(payload, source = "webview-deeplink")
                        }
                        return true
                    }

                    try {
                        val browserIntent = Intent(Intent.ACTION_VIEW, uri)
                        browserIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        startActivity(browserIntent)
                    } catch (e: Exception) {
                        Log.w(TAG, "No app to handle $url")
                    }
                    return true
                }

                override fun onPageFinished(view: WebView, url: String?) {
                    super.onPageFinished(view, url)
                    appendLog("[WebView] onPageFinished: $url")
                    pageLoaded = true

                    // Inject auth token after every page load (web app may have
                    // reloaded and lost the in-memory session).
                    val payload = authStore.load()
                    if (payload.hasToken() && payload.token != lastInjectedToken) {
                        injectAuthToWebView(payload)
                    }

                    // If a deep link arrived before page load, replay it now
                    pendingDeepLink?.let { link ->
                        pendingDeepLink = null
                        val pendingPayload = DeepLinkParser.parse(link)
                        if (pendingPayload != null) {
                            mainHandler.postDelayed({ injectAuthToWebView(pendingPayload) }, 500)
                        }
                    }
                }

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: android.webkit.WebResourceError
                ) {
                    super.onReceivedError(view, request, error)
                    appendLog("[WebView] Error: ${error.description} (url=${request.url})")
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView, newProgress: Int) {
                    progressBar.progress = newProgress
                    progressBar.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
                }

                override fun onConsoleMessage(consoleMessage: android.webkit.ConsoleMessage): Boolean {
                    appendLog("[Console] ${consoleMessage.message()} (${consoleMessage.sourceId()}:${consoleMessage.lineNumber()})")
                    return true
                }
            }

            // Start loading immediately
            loadUrl(WEB_APP_URL)
        }
    }

    // ============================================================
    // Local HTTP callback server
    // ============================================================

    private fun startCallbackServer() {
        val server = LocalCallbackServer { payload ->
            // Called on NanoHTTPD's worker thread — hop back to UI thread
            runOnUiThread {
                onAuthReceived(payload, source = "http-callback")
            }
        }
        server.startServer()
        callbackServer = server
    }

    // ============================================================
    // Token persistence + injection
    // ============================================================

    /**
     * Called when a new auth token is received (via deep link or HTTP callback).
     *
     * Mirrors macos-agent's persistAndSyncAuth():
     *   1. Persist to AuthStore
     *   2. Inject into WebView (if loaded)
     *   3. Update lastInjectedToken to prevent duplicate re-injections
     */
    private fun onAuthReceived(payload: AuthPayload, source: String) {
        appendLog("[Auth] Received from $source: email=${payload.email} tokenLen=${payload.token.length}")

        authStore.save(payload)
        lastInjectedToken = payload.token

        if (pageLoaded) {
            injectAuthToWebView(payload)
        } else {
            // Page not loaded yet — inject after next onPageFinished
            appendLog("[Auth] WebView not ready, deferring injection")
        }
    }

    /**
     * Inject the auth token into the WebView via JavaScript.
     *
     * Mirrors macos-agent's injectAuthToWebWindow():
     *   1. Set localStorage['clipop_access_token'] + ['clipop_refresh_token']
     *   2. Set window.__clipopDesktopToken etc.
     *   3. Call window.__supabaseClient.auth.setSession() if available
     *   4. Dispatch 'clipop-desktop-login' events (15 times at 500ms intervals)
     */
    private fun injectAuthToWebView(payload: AuthPayload) {
        if (!payload.hasToken()) {
            appendLog("[Inject] No token, skipping")
            return
        }
        lastInjectedToken = payload.token
        appendLog("[Inject] Injecting token (len=${payload.token.length}, email=${payload.email})")

        val jsonPayload = JSONObject().apply {
            put("token", payload.token)
            put("refreshToken", payload.refreshToken)
            put("email", payload.email)
            put("userId", payload.userId)
            put("name", payload.name)
        }.toString()

        // The injected JS string uses JSON.parse to avoid quoting issues.
        val js = """
            (function() {
                try {
                    var payload = $jsonPayload;
                    var token = payload.token || '';
                    var refreshToken = payload.refreshToken || '';
                    var email = payload.email || '';
                    var userId = payload.userId || '';
                    var name = payload.name || '';

                    if (token) localStorage.setItem('clipop_access_token', token);
                    if (refreshToken) localStorage.setItem('clipop_refresh_token', refreshToken);

                    window.__clipopDesktopToken = token;
                    window.__clipopDesktopRefreshToken = refreshToken;
                    window.__clipopDesktopEmail = email;
                    window.__clipopDesktopUserId = userId;
                    window.__clipopDesktopName = name;

                    function trySetSession() {
                        if (window.__supabaseClient && refreshToken && token) {
                            console.log('[DEBUG-INJECT] Calling supabase.auth.setSession...');
                            window.__supabaseClient.auth.setSession({
                                access_token: token,
                                refresh_token: refreshToken
                            }).then(function(r) {
                                console.log('[DEBUG-INJECT] setSession result:', !!(r && r.data && r.data.session));
                                window.dispatchEvent(new Event('clipop-auth-change'));
                            }).catch(function(e) {
                                console.log('[DEBUG-INJECT] setSession error:', e && e.message);
                            });
                        } else if (refreshToken && token) {
                            setTimeout(trySetSession, 500);
                        }
                    }
                    trySetSession();

                    for (var i = 0; i < 15; i++) {
                        setTimeout(function() {
                            var event = new CustomEvent('clipop-desktop-login', {
                                detail: { token: token, refreshToken: refreshToken, email: email, userId: userId, name: name }
                            });
                            window.dispatchEvent(event);
                            window.dispatchEvent(new Event('clipop-auth-change'));
                        }, i * 500);
                    }
                    return 'OK';
                } catch (e) {
                    console.error('[DEBUG-INJECT] error', e && e.message);
                    return 'ERROR';
                }
            })();
        """.trimIndent()

        runOnUiThread {
            webView.evaluateJavascript(js) { result ->
                appendLog("[Inject] evaluateJavascript returned: $result")
            }
        }
    }

    // ============================================================
    // OAuth browser launch (Custom Tabs)
    // ============================================================

    /**
     * Open a Chrome Custom Tab pointing to a path on the web app.
     * Includes ?from=desktop and &callback=http://127.0.0.1:PORT so the
     * web app knows to POST the token back to our local server.
     */
    private fun openCustomTab(path: String) {
        val callbackOrigin = callbackServer?.callbackOrigin() ?: ""
        val base = Uri.parse(WEB_APP_URL + path)
        val existingCallback = base.getQueryParameter("callback")
        val uri = if (existingCallback.isNullOrBlank() && callbackOrigin.isNotEmpty()) {
            base.buildUpon().appendQueryParameter("callback", callbackOrigin).build()
        } else {
            base
        }

        appendLog("[OAuth] Opening Custom Tab: $uri")
        try {
            val intent = CustomTabsIntent.Builder()
                .setShowTitle(true)
                .setUrlBarHidingEnabled(false)
                .build()
            intent.launchUrl(this, uri)
        } catch (e: Exception) {
            Log.w(TAG, "Custom Tabs not available, falling back to ACTION_VIEW: ${e.message}")
            try {
                val browserIntent = Intent(Intent.ACTION_VIEW, uri)
                browserIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                startActivity(browserIntent)
            } catch (e2: Exception) {
                Toast.makeText(this, "No browser available", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // ============================================================
    // Logging
    // ============================================================

    private fun appendLog(msg: String) {
        val timestamp = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", java.util.Locale.US)
            .format(java.util.Date())
        val line = "[$timestamp] $msg"
        synchronized(logBuffer) {
            logBuffer.add(line)
            if (logBuffer.size > 500) {
                logBuffer.subList(0, logBuffer.size - 500).clear()
            }
        }
        Log.d(TAG, msg)
    }
}
