package com.clipop.agent

import android.net.Uri
import android.util.Log

/**
 * Parses clipop:// deep links produced by the web app after a successful login.
 *
 * Web app format (src/lib/desktop-auth.ts buildDesktopDeepLink):
 *   clipop://login-success?token=...&refreshToken=...&email=...&userId=...&name=...
 */
data class DeepLinkPayload(
    val token: String = "",
    val refreshToken: String = "",
    val email: String = "",
    val userId: String = "",
    val name: String = "",
) {
    fun hasToken(): Boolean = token.isNotEmpty()
}

object DeepLinkParser {

    private const val TAG = "DeepLinkParser"
    private const val HOST = "login-success"

    /**
     * Parse a clipop:// URL into a DeepLinkPayload. Returns null if the URL
     * is not a valid login-success deep link or is missing a token.
     */
    fun parse(uri: Uri?): DeepLinkPayload? {
        if (uri == null) {
            Log.d(TAG, "parse: uri is null")
            return null
        }
        if (uri.scheme?.lowercase() != "clipop") {
            Log.d(TAG, "parse: scheme mismatch (got ${uri.scheme})")
            return null
        }
        if (uri.host?.lowercase() != HOST) {
            Log.d(TAG, "parse: host mismatch (got ${uri.host}, expected $HOST)")
            return null
        }

        val payload = DeepLinkPayload(
            token = uri.getQueryParameter("token")?.orEmpty() ?: "",
            refreshToken = uri.getQueryParameter("refreshToken")?.orEmpty() ?: "",
            email = uri.getQueryParameter("email")?.orEmpty() ?: "",
            userId = uri.getQueryParameter("userId")?.orEmpty() ?: "",
            name = uri.getQueryParameter("name")?.orEmpty() ?: "",
        )

        return if (payload.hasToken()) payload else {
            Log.d(TAG, "parse: missing token parameter")
            null
        }
    }

    /**
     * Parse from an intent data string. Accepts both `clipop://...` URIs
     * and `intent://...#Intent;scheme=clipop;...` formats.
     */
    fun parse(dataString: String?): DeepLinkPayload? {
        if (dataString.isNullOrBlank()) return null
        return try {
            parse(Uri.parse(dataString))
        } catch (e: Exception) {
            Log.e(TAG, "parse failed: ${e.message}")
            null
        }
    }
}
