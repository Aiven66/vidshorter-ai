package com.clipop.ai.data.models

import com.google.gson.annotations.SerializedName

/** 对齐服务端 AgentJob / AgentClip / AgentHighlight 数据模型 */

data class AgentJob(
    val id: String,
    val videoUrl: String,
    val userId: String,
    val desiredClipCount: Int = 0,
    val createdAt: String = "",
    val updatedAt: String = "",
    val status: String = "queued",        // queued | processing | completed | failed
    val stage: String = "",
    val progress: Int = 0,
    val message: String = "",
    val claimedBy: String? = null,
    val error: String? = null,
    val result: JobResult? = null
)

data class JobResult(
    val title: String? = null,
    val duration: Long = 0,
    val highlights: List<AgentHighlight> = emptyList(),
    val clips: List<AgentClip> = emptyList()
)

data class AgentHighlight(
    val title: String = "",
    @SerializedName("start_time") val startTime: Double = 0.0,
    @SerializedName("end_time") val endTime: Double = 0.0,
    val summary: String = "",
    @SerializedName("engagement_score") val engagementScore: Double = 0.0
)

data class AgentClip(
    val id: String = "",
    val title: String = "",
    val startTime: Int = 0,
    val endTime: Int = 0,
    val duration: Int = 0,
    val summary: String = "",
    val engagementScore: Double = 0.0,
    val thumbnailUrl: String = "",
    val videoUrl: String? = null,
    val status: String = "processing",    // processing | completed | failed
    val error: String? = null
)

/** 创建 Job 请求 */
data class CreateJobRequest(
    val videoUrl: String,
    val userId: String,
    val desiredClipCount: Int? = null
)

/** 创建 Job 响应 */
data class CreateJobResponse(val job: AgentJob)

/** 拉取 Job 请求 */
data class PullJobRequest(val agentId: String)

/** 拉取 Job 响应 */
data class PullJobResponse(val job: AgentJob?)

/** 上报 Job 请求 */
data class ReportJobRequest(
    val jobId: String,
    val status: String? = null,
    val stage: String? = null,
    val progress: Int? = null,
    val message: String? = null,
    val result: JobResult? = null,
    val error: String? = null
)

/** 视频分析结果（复刻 videoClipper.analyzeVideo） */
data class VideoAnalysis(
    val title: String,
    val duration: Long,
    val highlights: List<AgentHighlight>
)

/** 本地剪辑产物 */
data class LocalClipResult(
    val videoPath: String,
    val thumbnailPath: String,
    val dataUrl: String? = null
)

/** 下载源视频产物 */
data class SourceVideo(
    val inputPath: String,
    val audioInputPath: String? = null,
    val ffmpegHeaders: String? = null
)

/** 认证信息 */
data class AuthState(
    val token: String? = null,
    val refreshToken: String? = null,
    val email: String? = null,
    val userId: String? = null,
    val name: String? = null
) {
    val isLoggedIn: Boolean get() = !token.isNullOrBlank()
}
