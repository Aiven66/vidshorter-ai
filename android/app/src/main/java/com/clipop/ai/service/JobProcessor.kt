package com.clipop.ai.service

import android.content.Context
import android.util.Log
import com.clipop.ai.data.ApiClient
import com.clipop.ai.data.models.*
import com.clipop.ai.video.VideoDownloader
import com.clipop.ai.video.VideoProcessor
import kotlinx.coroutines.delay
import java.io.File

/**
 * 单个 Job 的处理引擎，完整复刻 macOS Agent runner.ts 的 processJob 流程：
 *   1. report(processing, ai_analysis)     → 分析视频生成高光
 *   2. report(processing, analysis_complete) → 高光解析完成
 *   3. report(processing, generating_clip)   → 下载源视频
 *   4. 循环每个 highlight: createLocalClip → report(进度)
 *   5. report(completed / failed)
 */
class JobProcessor(
    private val context: Context,
    private val api: ApiClient,
    private val agentId: String
) {
    private val tag = "JobProcessor"
    private val workDir = File(context.cacheDir, "clipop-work")

    private val downloader = VideoDownloader(workDir = workDir)
    private val processor = VideoProcessor(context, workDir)

    /** 处理单个 Job，完整复刻 runner.ts → processJob */
    suspend fun processJob(job: AgentJob) {
        Log.i(tag, "Job claimed: ${job.id} url=${job.videoUrl}")

        // 1. AI 分析阶段
        report(job.id, "processing", "ai_analysis", 10, "Analyzing video and generating highlights...")

        val analysis = try {
            downloader.analyzeVideo(job.videoUrl)
        } catch (e: Exception) {
            Log.e(tag, "analyzeVideo failed: ${e.message}")
            report(job.id, "failed", "error", 0, "Analysis failed: ${e.message}", error = e.message)
            return
        }

        // 计算目标剪辑数（与服务端 autoCount 逻辑一致）
        val autoCount = when {
            analysis.duration >= 2 * 3600 -> 10
            analysis.duration >= 90 * 60 -> 9
            analysis.duration >= 3600 -> 8
            analysis.duration >= 40 * 60 -> 7
            analysis.duration >= 25 * 60 -> 6
            analysis.duration >= 15 * 60 -> 5
            analysis.duration >= 8 * 60 -> 4
            else -> 3
        }
        val desired = if (job.desiredClipCount > 0) {
            job.desiredClipCount.coerceIn(1, 10)
        } else autoCount
        val highlights = analysis.highlights.take(desired)

        report(job.id, "processing", "analysis_complete", 35,
            "Found ${highlights.size} highlight moments.",
            result = JobResult(title = analysis.title, duration = analysis.duration, highlights = highlights))

        // 2. 下载源视频
        report(job.id, "processing", "generating_clip", 40, "Preparing source video...")

        val source = try {
            downloader.downloadSourceVideo(job.videoUrl)
        } catch (e: Exception) {
            Log.e(tag, "downloadSourceVideo failed: ${e.message}")
            report(job.id, "failed", "error", 0, "Download failed: ${e.message}", error = e.message)
            return
        }

        // 3. 逐个生成剪辑
        val clips = mutableListOf<AgentClip>()
        for ((i, h) in highlights.withIndex()) {
            val start = h.startTime.toInt().coerceAtLeast(0)
            val end = h.endTime.toInt().coerceAtLeast(start + 1)

            val draft = AgentClip(
                id = "${job.id}-clip-$i",
                title = h.title,
                startTime = start,
                endTime = end,
                duration = end - start,
                summary = h.summary,
                engagementScore = h.engagementScore,
                thumbnailUrl = "",
                videoUrl = null,
                status = "processing"
            )

            report(job.id, "processing", "generating_clip",
                45 + ((i.toFloat() / highlights.size) * 45).toInt(),
                "Generating clip ${i + 1}/${highlights.size}: \"${h.title}\"",
                result = JobResult(
                    title = analysis.title,
                    duration = analysis.duration,
                    highlights = highlights,
                    clips = (clips + draft)
                ))

            try {
                val result = processor.createLocalClip(
                    inputPath = source.inputPath,
                    startTime = start,
                    endTime = end,
                    title = h.title,
                    headers = source.ffmpegHeaders
                )
                clips.add(draft.copy(
                    status = "completed",
                    thumbnailUrl = if (result.thumbnailPath.isNotEmpty()) {
                        processor.imageToDataUrl(result.thumbnailPath) ?: ""
                    } else "",
                    videoUrl = result.dataUrl ?: result.videoPath
                ))
                Log.i(tag, "Clip ${i + 1} done: ${result.videoPath}")
            } catch (e: Exception) {
                Log.e(tag, "Clip ${i + 1} failed: ${e.message}")
                clips.add(draft.copy(
                    status = "failed",
                    error = e.message?.take(800)
                ))
            }
        }

        // 4. 汇报最终结果
        val completed = clips.count { it.status == "completed" }
        if (completed == 0) {
            report(job.id, "failed", "error", 0,
                "All clips failed to generate.",
                error = "All clips failed to generate.",
                result = JobResult(title = analysis.title, duration = analysis.duration, highlights = highlights, clips = clips))
        } else {
            report(job.id, "completed", "complete", 100,
                "Generated $completed clips.",
                result = JobResult(title = analysis.title, duration = analysis.duration, highlights = highlights, clips = clips))
        }

        // 清理临时文件
        processor.cleanupAll()
        Log.i(tag, "Job done: ${job.id}")
    }

    /** 带重试的上报（复刻 runner.ts → reportWithRetry） */
    private suspend fun report(
        jobId: String,
        status: String,
        stage: String,
        progress: Int,
        message: String,
        result: JobResult? = null,
        error: String? = null
    ) {
        val payload = ReportJobRequest(
            jobId = jobId,
            status = status,
            stage = stage,
            progress = progress,
            message = message,
            result = result,
            error = error
        )
        var lastErr: String? = null
        for (attempt in 0 until 6) {
            try {
                if (api.reportJob(payload)) return
            } catch (e: Exception) {
                lastErr = e.message
            }
            delay(minOf(4000L, 300L * (1L shl attempt)))
        }
        Log.w(tag, "Report failed after retries: $lastErr")
    }
}
