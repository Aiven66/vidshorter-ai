package com.clipop.ai.data

import com.clipop.ai.data.models.*
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * 服务端 API 客户端，对齐 Web 端全部 Agent 相关端点。
 * 端点：/api/agent/jobs (POST), /pull (POST), /report (POST), /:jobId (GET)
 * 鉴权：Bearer token (用户) + x-agent-secret (Agent)
 */
class ApiClient(
    var serverUrl: String = DEFAULT_SERVER,
    var agentSecret: String = ""
) {
    private val gson = Gson()
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private fun baseUrl(): String = serverUrl.trimEnd('/')

    private fun authHeaders(auth: AuthState): Map<String, String> {
        val headers = mutableMapOf<String, String>()
        auth.token?.let { headers["Authorization"] = "Bearer $it" }
        if (agentSecret.isNotBlank()) headers["x-agent-secret"] = agentSecret
        return headers
    }

    /** POST /api/agent/jobs — 创建 Job */
    suspend fun createJob(videoUrl: String, auth: AuthState, desiredClipCount: Int? = null): AgentJob =
        withContext(Dispatchers.IO) {
            val body = gson.toJson(
                CreateJobRequest(
                    videoUrl = videoUrl,
                    userId = auth.userId ?: "demo-user",
                    desiredClipCount = desiredClipCount
                )
            )
            val req = buildRequest("POST", "/api/agent/jobs", body, authHeaders(auth))
            client.newCall(req).execute().use { res ->
                if (!res.isSuccessful) throw ApiException(res.code, res.body?.string().orEmpty())
                gson.fromJson(res.body?.string(), CreateJobResponse::class.java).job
            }
        }

    /** POST /api/agent/jobs/pull — Agent 拉取下一个待处理 Job */
    suspend fun pullJob(agentId: String): AgentJob? = withContext(Dispatchers.IO) {
        val body = gson.toJson(PullJobRequest(agentId))
        val req = buildRequest("POST", "/api/agent/jobs/pull", body, agentHeaders())
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw ApiException(res.code, res.body?.string().orEmpty())
            gson.fromJson(res.body?.string(), PullJobResponse::class.java).job
        }
    }

    /** POST /api/agent/jobs/report — Agent 上报进度/结果 */
    suspend fun reportJob(report: ReportJobRequest): Boolean = withContext(Dispatchers.IO) {
        val body = gson.toJson(report)
        val req = buildRequest("POST", "/api/agent/jobs/report", body, agentHeaders())
        client.newCall(req).execute().use { res -> res.isSuccessful }
    }

    /** GET /api/agent/jobs/:jobId — 查询 Job 状态 */
    suspend fun getJob(jobId: String, auth: AuthState): AgentJob = withContext(Dispatchers.IO) {
        val req = buildRequest("GET", "/api/agent/jobs/$jobId", null, authHeaders(auth))
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw ApiException(res.code, res.body?.string().orEmpty())
            val resp = gson.fromJson(res.body?.string(), Map::class.java)
            @Suppress("UNCHECKED_CAST")
            gson.fromJson(gson.toJson(resp["job"]), AgentJob::class.java)
        }
    }

    /** GET /api/check-login — 检查 Web 端登录态 */
    suspend fun checkLogin(): Boolean = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("${baseUrl()}/api/check-login").build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) return@use false
            val resp = gson.fromJson(res.body?.string(), Map::class.java)
            resp?.get("loggedIn") == true
        }
    }

    private fun buildRequest(
        method: String,
        path: String,
        body: String?,
        headers: Map<String, String>
    ): Request {
        val builder = Request.Builder().url("${baseUrl()}$path")
        headers.forEach { (k, v) -> builder.header(k, v) }
        when (method) {
            "POST" -> builder.post((body ?: "{}").toRequestBody(jsonMedia))
            "GET" -> builder.get()
        }
        return builder.build()
    }

    private fun agentHeaders(): Map<String, String> =
        if (agentSecret.isNotBlank()) mapOf("x-agent-secret" to agentSecret) else emptyMap()

    companion object {
        const val DEFAULT_SERVER = "https://www.clipopai.com"
    }
}

class ApiException(val code: Int, val errorBody: String) :
    Exception("API error $code: $errorBody")
