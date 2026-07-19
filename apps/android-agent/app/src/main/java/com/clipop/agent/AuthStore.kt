package com.clipop.agent

import android.content.Context
import android.util.Log
import org.json.JSONObject

/**
 * Persistent token store backed by SharedPreferences.
 *
 * Equivalent to macos-agent/main.js's config.json:
 *   authToken, authRefreshToken, authEmail, authUserId, authName
 *
 * Stored as a single JSON string under PREF_KEY so we can extend it later
 * without needing to migrate individual SharedPreferences keys.
 */
data class AuthPayload(
    val token: String = "",
    val refreshToken: String = "",
    val email: String = "",
    val userId: String = "",
    val name: String = "",
) {
    fun hasToken(): Boolean = token.isNotEmpty()

    fun toJson(): JSONObject = JSONObject().apply {
        put("token", token)
        put("refreshToken", refreshToken)
        put("email", email)
        put("userId", userId)
        put("name", name)
    }

    companion object {
        fun fromJson(obj: JSONObject): AuthPayload {
            return AuthPayload(
                token = obj.optString("token", ""),
                refreshToken = obj.optString("refreshToken", ""),
                email = obj.optString("email", ""),
                userId = obj.optString("userId", ""),
                name = obj.optString("name", ""),
            )
        }
    }
}

class AuthStore private constructor(context: Context) {

    companion object {
        private const val TAG = "AuthStore"
        private const val PREF_NAME = "clipop_auth"
        private const val PREF_KEY = "auth_payload"

        @Volatile private var instance: AuthStore? = null
        fun get(context: Context): AuthStore {
            return instance ?: synchronized(this) {
                instance ?: AuthStore(context.applicationContext).also { instance = it }
            }
        }
    }

    private val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    fun load(): AuthPayload {
        return try {
            val raw = prefs.getString(PREF_KEY, "") ?: ""
            if (raw.isEmpty()) AuthPayload()
            else AuthPayload.fromJson(JSONObject(raw))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load auth payload: ${e.message}")
            AuthPayload()
        }
    }

    fun save(payload: AuthPayload) {
        try {
            prefs.edit().putString(PREF_KEY, payload.toJson().toString()).apply()
            Log.d(TAG, "Saved auth payload (token=${payload.token.isNotEmpty()}, email=${payload.email})")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save auth payload: ${e.message}")
        }
    }

    fun clear() {
        prefs.edit().remove(PREF_KEY).apply()
        Log.d(TAG, "Cleared auth payload")
    }
}
