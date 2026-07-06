package com.clipop.ai.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.clipop.ai.data.ApiClient
import com.clipop.ai.data.AuthManager
import com.clipop.ai.data.models.AgentJob
import com.clipop.ai.data.models.AuthState
import com.clipop.ai.service.AgentService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val authManager = AuthManager(app)

    private val _authState = MutableStateFlow(AuthState())
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val _serverUrl = MutableStateFlow(ApiClient.DEFAULT_SERVER)
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private val _agentSecret = MutableStateFlow("")
    val agentSecret: StateFlow<String> = _agentSecret.asStateFlow()

    private val _agentId = MutableStateFlow("")
    val agentId: StateFlow<String> = _agentId.asStateFlow()

    private val _isAgentRunning = MutableStateFlow(false)
    val isAgentRunning: StateFlow<Boolean> = _isAgentRunning.asStateFlow()

    private val _jobs = MutableStateFlow<List<AgentJob>>(emptyList())
    val jobs: StateFlow<List<AgentJob>> = _jobs.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _lastCreatedJobId = MutableStateFlow<String?>(null)
    val lastCreatedJobId: StateFlow<String?> = _lastCreatedJobId.asStateFlow()

    init {
        loadSettings()
    }

    private fun loadSettings() {
        viewModelScope.launch {
            _authState.value = authManager.getAuthState()
            _serverUrl.value = authManager.getServerUrl()
            _agentSecret.value = authManager.getAgentSecret()
            _agentId.value = authManager.getAgentId()
        }
    }

    fun apiClient(): ApiClient = ApiClient(
        serverUrl = _serverUrl.value,
        agentSecret = _agentSecret.value
    )

    /** 提交视频 URL 创建 Job */
    fun submitVideo(url: String, desiredClipCount: Int? = null) {
        val auth = _authState.value
        if (!auth.isLoggedIn) {
            _error.value = "Please login first"
            return
        }
        if (url.isBlank()) {
            _error.value = "Please enter a video URL"
            return
        }
        _isLoading.value = true
        _error.value = null
        viewModelScope.launch {
            try {
                val job = apiClient().createJob(url, auth, desiredClipCount)
                _jobs.value = listOf(job) + _jobs.value
                _lastCreatedJobId.value = job.id
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to create job"
            } finally {
                _isLoading.value = false
            }
        }
    }

    /** 刷新指定 Job 状态 */
    fun refreshJob(jobId: String) {
        val auth = _authState.value
        viewModelScope.launch {
            try {
                val job = apiClient().getJob(jobId, auth)
                _jobs.value = _jobs.value.map { if (it.id == jobId) job else it }
            } catch (_: Exception) { }
        }
    }

    /** 从 deep link 保存认证信息 */
    fun handleDeepLink(uri: android.net.Uri) {
        viewModelScope.launch {
            val auth = authManager.saveAuthFromDeepLink(uri)
            _authState.value = auth
        }
    }

    /** 保存服务器地址 */
    fun saveServerUrl(url: String) {
        viewModelScope.launch {
            authManager.saveServerUrl(url)
            _serverUrl.value = url.trimEnd('/')
        }
    }

    /** 保存 Agent Secret */
    fun saveAgentSecret(secret: String) {
        viewModelScope.launch {
            authManager.saveAgentSecret(secret)
            _agentSecret.value = secret
        }
    }

    /** 保存 Agent ID */
    fun saveAgentId(id: String) {
        viewModelScope.launch {
            authManager.saveAgentId(id)
            _agentId.value = id
        }
    }

    /** 启动/停止 Agent Service */
    fun toggleAgent() {
        val context = getApplication<Application>()
        if (_isAgentRunning.value) {
            AgentService.stop(context)
            _isAgentRunning.value = false
        } else {
            AgentService.start(context)
            _isAgentRunning.value = true
        }
    }

    /** 退出登录 */
    fun logout() {
        viewModelScope.launch {
            authManager.logout()
            _authState.value = AuthState()
        }
    }

    fun clearError() { _error.value = null }
}
