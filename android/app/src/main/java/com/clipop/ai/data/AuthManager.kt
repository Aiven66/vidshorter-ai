package com.clipop.ai.data

import android.content.Context
import android.net.Uri
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.clipop.ai.data.models.AuthState
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * 认证与设置管理器。
 * 持久化：用户 token、Agent 配置（serverUrl / agentSecret / agentId）。
 * 认证流程复刻 macOS 客户端：Web 登录 → deep link clipop://login-success?token=... 回传。
 */
private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "clipop_settings")

class AuthManager(private val context: Context) {

    object Keys {
        val TOKEN = stringPreferencesKey("auth_token")
        val REFRESH_TOKEN = stringPreferencesKey("auth_refresh_token")
        val EMAIL = stringPreferencesKey("auth_email")
        val USER_ID = stringPreferencesKey("auth_user_id")
        val NAME = stringPreferencesKey("auth_name")
        val SERVER_URL = stringPreferencesKey("server_url")
        val AGENT_SECRET = stringPreferencesKey("agent_secret")
        val AGENT_ID = stringPreferencesKey("agent_id")
    }

    val authStateFlow: Flow<AuthState> = context.dataStore.data.map { prefs ->
        AuthState(
            token = prefs[Keys.TOKEN],
            refreshToken = prefs[Keys.REFRESH_TOKEN],
            email = prefs[Keys.EMAIL],
            userId = prefs[Keys.USER_ID],
            name = prefs[Keys.NAME]
        )
    }

    val serverUrlFlow: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[Keys.SERVER_URL] ?: ApiClient.DEFAULT_SERVER
    }

    val agentSecretFlow: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[Keys.AGENT_SECRET] ?: ""
    }

    val agentIdFlow: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[Keys.AGENT_ID] ?: "agent-android-${System.currentTimeMillis()}"
    }

    suspend fun getAuthState(): AuthState = authStateFlow.first()

    suspend fun getServerUrl(): String = serverUrlFlow.first()

    suspend fun getAgentSecret(): String = agentSecretFlow.first()

    suspend fun getAgentId(): String = agentIdFlow.first()

    /** 从 deep link clipop://login-success?token=... 解析并保存认证信息 */
    suspend fun saveAuthFromDeepLink(uri: Uri): AuthState {
        val token = uri.getQueryParameter("token").orEmpty()
        val refreshToken = uri.getQueryParameter("refreshToken").orEmpty()
        val email = uri.getQueryParameter("email").orEmpty()
        val userId = uri.getQueryParameter("userId").orEmpty()
        val name = uri.getQueryParameter("name").orEmpty()

        context.dataStore.edit { prefs ->
            if (token.isNotBlank()) prefs[Keys.TOKEN] = token
            if (refreshToken.isNotBlank()) prefs[Keys.REFRESH_TOKEN] = refreshToken
            if (email.isNotBlank()) prefs[Keys.EMAIL] = email
            if (userId.isNotBlank()) prefs[Keys.USER_ID] = userId
            if (name.isNotBlank()) prefs[Keys.NAME] = name
        }
        return getAuthState()
    }

    suspend fun saveAuth(auth: AuthState) {
        context.dataStore.edit { prefs ->
            auth.token?.let { prefs[Keys.TOKEN] = it }
            auth.refreshToken?.let { prefs[Keys.REFRESH_TOKEN] = it }
            auth.email?.let { prefs[Keys.EMAIL] = it }
            auth.userId?.let { prefs[Keys.USER_ID] = it }
            auth.name?.let { prefs[Keys.NAME] = it }
        }
    }

    suspend fun logout() {
        context.dataStore.edit { prefs ->
            prefs.remove(Keys.TOKEN)
            prefs.remove(Keys.REFRESH_TOKEN)
            prefs.remove(Keys.EMAIL)
            prefs.remove(Keys.USER_ID)
            prefs.remove(Keys.NAME)
        }
    }

    suspend fun saveServerUrl(url: String) {
        context.dataStore.edit { it[Keys.SERVER_URL] = url.trimEnd('/') }
    }

    suspend fun saveAgentSecret(secret: String) {
        context.dataStore.edit { it[Keys.AGENT_SECRET] = secret }
    }

    suspend fun saveAgentId(id: String) {
        context.dataStore.edit { it[Keys.AGENT_ID] = id }
    }
}
