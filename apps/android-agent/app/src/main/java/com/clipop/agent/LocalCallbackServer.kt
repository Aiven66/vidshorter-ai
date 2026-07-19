package com.clipop.agent

import android.util.Log
import fi.iki.elonen.NanoHTTPD
import org.json.JSONObject
import java.net.InetAddress
import java.net.ServerSocket

/**
 * Local HTTP callback server on 127.0.0.1.
 *
 * Mirrors macos-agent/main.js startAuthCallbackServer():
 *   - POST /api/desktop-auth        -> receive token JSON from web app
 *   - GET  /api/desktop-auth       -> returns {ok:true, version} (liveness probe)
 *   - GET  /api/desktop-login-redirect -> redirect target that the web app can
 *                                        navigate to (returns a small HTML page
 *                                        that triggers clipop:// deep link)
 *
 * The web app calls these endpoints via fetch() to deliver the OAuth token
 * without forcing the user through a deep link redirect (deep link is the
 * secondary channel — see DeepLinkParser).
 *
 * Port is dynamically chosen (0 = ephemeral) and exposed via [port].
 * The web app reads the port via AuthBridge.getAuthCallbackUrl().
 */
class LocalCallbackServer(
    private val onAuthReceived: (AuthPayload) -> Unit,
) : NanoHTTPD("127.0.0.1", 0) {

    companion object {
        private const val TAG = "LocalCallbackServer"
    }

    val port: Int
        get() = listeningPort

    /** Marker set after start() succeeds — used to suppress error logs during shutdown. */
    @Volatile private var running = false

    fun startServer() {
        try {
            start(SOCKET_READ_TIMEOUT, false)
            running = true
            Log.i(TAG, "Local callback server listening on http://127.0.0.1:$port")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start local callback server: ${e.message}")
            running = false
        }
    }

    fun stopServer() {
        if (!running) return
        running = false
        try {
            stop()
        } catch (e: Exception) {
            Log.w(TAG, "stop() error: ${e.message}")
        }
    }

    /** Returns the http://127.0.0.1:PORT origin that the web app should POST to. */
    fun callbackOrigin(): String = "http://127.0.0.1:$port"

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri ?: "/"
        val method = session.method

        // CORS headers so the web app (https://www.clipopai.com) can call this
        // from a fetch() request. Mirrors the Access-Control-Allow-* headers
        // in the macos-agent auth callback server.
        val corsHeaders = mapOf(
            "Access-Control-Allow-Origin" to "*",
            "Access-Control-Allow-Methods" to "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers" to "Content-Type",
            "Access-Control-Allow-Private-Network" to "true",
        )

        if (method == Method.OPTIONS) {
            return newFixedLengthResponse(Response.Status.OK, MIME_PLAINTEXT, "")
                .apply { corsHeaders.forEach { (k, v) -> addHeader(k, v) } }
        }

        // POST /api/desktop-auth — receive token JSON
        if (uri == "/api/desktop-auth" && method == Method.POST) {
            return handlePostAuth(session, corsHeaders)
        }

        // GET /api/desktop-auth — liveness probe
        if (uri == "/api/desktop-auth" && method == Method.GET) {
            val body = JSONObject().apply {
                put("ok", true)
                put("version", BuildConfig.VERSION_NAME)
            }.toString()
            return newFixedLengthResponse(Response.Status.OK, "application/json", body)
                .apply { corsHeaders.forEach { (k, v) -> addHeader(k, v) } }
        }

        // GET /api/desktop-login-redirect?token=...&refreshToken=...&email=...&userId=...&name=...
        // Web app redirects here; we return a tiny HTML page that immediately
        // triggers clipop://login-success?... so the OS opens our app.
        if (uri == "/api/desktop-login-redirect" && method == Method.GET) {
            return handleLoginRedirect(session, corsHeaders)
        }

        return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not Found")
            .apply { corsHeaders.forEach { (k, v) -> addHeader(k, v) } }
    }

    private fun handlePostAuth(session: IHTTPSession, corsHeaders: Map<String, String>): Response {
        try {
            // NanoHTTPD requires us to parse the body via getBody() — which forces
            // us to read it from the tmp files map. Use parseBody() to populate it.
            val files = HashMap<String, String>()
            val parsedLength = session.parseBody(files)
            val raw = files["postData"] ?: ""
            Log.d(TAG, "POST /api/desktop-auth body length=$parsedLength")

            val obj = if (raw.isNotEmpty()) JSONObject(raw) else JSONObject()
            val payload = AuthPayload(
                token = obj.optString("token", obj.optString("access_token", "")),
                refreshToken = obj.optString("refreshToken", obj.optString("refresh_token", "")),
                email = obj.optString("email", ""),
                userId = obj.optString("userId", obj.optString("user_id", "")),
                name = obj.optString("name", ""),
            )

            if (!payload.hasToken()) {
                val body = JSONObject().apply {
                    put("ok", false)
                    put("error", "No token provided")
                }.toString()
                return newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", body)
                    .apply { corsHeaders.forEach { (k, v) -> addHeader(k, v) } }
            }

            Log.i(TAG, "Received auth token via POST (email=${payload.email})")
            onAuthReceived(payload)

            val body = JSONObject().apply {
                put("ok", true)
                put("message", "Token received")
            }.toString()
            return newFixedLengthResponse(Response.Status.OK, "application/json", body)
                .apply { corsHeaders.forEach { (k, v) -> addHeader(k, v) } }
        } catch (e: Exception) {
            Log.e(TAG, "POST /api/desktop-auth failed: ${e.message}")
            val body = JSONObject().apply {
                put("ok", false)
                put("error", e.message ?: "Unknown error")
            }.toString()
            return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "application/json", body)
                .apply { corsHeaders.forEach { (k, v) -> addHeader(k, v) } }
        }
    }

    private fun handleLoginRedirect(session: IHTTPSession, corsHeaders: Map<String, String>): Response {
        val params = session.parameters
        val token = params["token"]?.firstOrNull().orEmpty()
        val refreshToken = params["refreshToken"]?.firstOrNull().orEmpty()
        val email = params["email"]?.firstOrNull().orEmpty()
        val userId = params["userId"]?.firstOrNull().orEmpty()
        val name = params["name"]?.firstOrNull().orEmpty()

        // Build a deep link and embed it in a self-closing HTML page.
        // The page auto-redirects via window.location.href = deepLink.
        // If the OS can't handle clipop://, the user sees a "Back to web" button.
        val deepLinkParams = buildString {
            append("?token=").append(java.net.URLEncoder.encode(token, "UTF-8"))
            if (refreshToken.isNotEmpty()) append("&refreshToken=").append(java.net.URLEncoder.encode(refreshToken, "UTF-8"))
            append("&email=").append(java.net.URLEncoder.encode(email, "UTF-8"))
            append("&userId=").append(java.net.URLEncoder.encode(userId, "UTF-8"))
            append("&name=").append(java.net.URLEncoder.encode(name, "UTF-8"))
        }
        val deepLink = "clipop://login-success$deepLinkParams"

        val html = """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Clipop Agent</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                           display: flex; align-items: center; justify-content: center;
                           min-height: 100vh; margin: 0; background: #f5f5f5; color: #333; }
                    .card { text-align: center; padding: 32px; background: white;
                            border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                            max-width: 360px; }
                    h1 { font-size: 20px; margin: 0 0 8px; }
                    p { font-size: 14px; color: #666; margin: 8px 0 24px; }
                    button { background: #2563eb; color: white; border: none; padding: 12px 24px;
                             border-radius: 6px; font-size: 14px; cursor: pointer; }
                    button:hover { background: #1d4ed8; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>Returning to Clipop Agent...</h1>
                    <p>If the app doesn't open automatically, tap the button below.</p>
                    <button onclick="window.location.href='$deepLink'">Open Clipop Agent</button>
                </div>
                <script>
                    window.location.href = '$deepLink';
                </script>
            </body>
            </html>
        """.trimIndent()

        return newFixedLengthResponse(Response.Status.OK, "text/html", html)
            .apply { corsHeaders.forEach { (k, v) -> addHeader(k, v) } }
    }
}
