package com.clipop.ai.video

import android.content.Context
import android.util.Base64
import android.util.Log
import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.FFprobeKit
import com.arthenica.ffmpegkit.ReturnCode
import com.clipop.ai.data.models.LocalClipResult
import java.io.File
import java.io.FileInputStream
import java.util.UUID

/**
 * 视频剪辑处理器，复刻服务端 videoClipper.createLocalClip。
 * 使用 FFmpegKit 在设备本地执行：
 *   - 截取指定时间段的视频片段
 *   - 生成缩略图
 *   - 产物转为 base64 dataUrl 或保存为本地文件
 */
class VideoProcessor(private val context: Context, private val workDir: File) {

    private val tag = "VideoProcessor"

    init {
        workDir.mkdirs()
    }

    /**
     * 创建本地剪辑。
     * @param inputPath 源视频路径
     * @param startTime 起始秒
     * @param endTime 结束秒
     * @param title 片段标题
     * @param headers 可选的 ffmpeg headers（用于远程流）
     */
    suspend fun createLocalClip(
        inputPath: String,
        startTime: Int,
        endTime: Int,
        title: String,
        headers: String? = null
    ): LocalClipResult {
        val clipId = UUID.randomUUID().toString()
        val duration = (endTime - startTime).coerceAtLeast(1)
        val clipFile = File(workDir, "clip-$clipId.mp4")
        val thumbFile = File(workDir, "thumb-$clipId.jpg")

        // 1. 提取视频片段
        val inputArg = if (inputPath.startsWith("http")) {
            inputPath
        } else {
            inputPath
        }

        val headerArgs = if (!headers.isNullOrBlank() && inputPath.startsWith("http")) {
            "-headers \"$headers\""
        } else ""

        val clipCmd = buildString {
            append("-y ")
            if (!headerArgs.isBlank()) append(headerArgs).append(" ")
            append("-ss $startTime -i \"$inputArg\" -t $duration ")
            append("-c:v libx264 -preset fast -crf 23 ")
            append("-c:a aac -b:a 128k ")
            append("-movflags +faststart ")
            append("\"${clipFile.absolutePath}\"")
        }

        Log.i(tag, "Clipping: $clipCmd")
        val clipSession = FFmpegKit.execute(clipCmd)
        if (!ReturnCode.isSuccess(clipSession.returnCode)) {
            val err = clipSession.failStackTrace ?: "Unknown ffmpeg error"
            Log.e(tag, "Clip failed: $err")
            throw RuntimeException("Clip failed: ${err.take(500)}")
        }

        // 2. 生成缩略图（取片段中点）
        val thumbTime = startTime + (duration / 2)
        val thumbCmd = "-y -ss $thumbTime -i \"${clipFile.absolutePath}\" -frames:v 1 -q:v 2 \"${thumbFile.absolutePath}\""
        val thumbSession = FFmpegKit.execute(thumbCmd)
        if (!ReturnCode.isSuccess(thumbSession.returnCode)) {
            Log.w(tag, "Thumbnail generation failed, using placeholder")
        }

        // 3. 转为 base64 dataUrl（与服务端一致，便于回传）
        val dataUrl = if (clipFile.exists() && clipFile.length() < 8 * 1024 * 1024) {
            // 小于 8MB 转为 base64
            try {
                val bytes = FileInputStream(clipFile).use { it.readBytes() }
                val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                "data:video/mp4;base64,$b64"
            } catch (e: Exception) {
                Log.w(tag, "base64 conversion failed: ${e.message}")
                null
            }
        } else {
            // 大文件不转 base64，使用本地路径
            null
        }

        return LocalClipResult(
            videoPath = clipFile.absolutePath,
            thumbnailPath = if (thumbFile.exists()) thumbFile.absolutePath else "",
            dataUrl = dataUrl
        )
    }

    /** 获取视频时长（秒） */
    fun getDuration(path: String): Long {
        val cmd = "-v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \"$path\""
        val session = FFprobeKit.execute(cmd)
        return if (ReturnCode.isSuccess(session.returnCode)) {
            session.output.trim().toDoubleOrNull()?.toLong() ?: 0L
        } else 0L
    }

    /** 清理指定剪辑产物 */
    fun cleanup(clipResult: LocalClipResult) {
        runCatching { File(clipResult.videoPath).delete() }
        runCatching { File(clipResult.thumbnailPath).delete() }
    }

    /** 清理全部临时文件 */
    fun cleanupAll() {
        workDir.listFiles()?.forEach { it.delete() }
    }

    /** 将图片文件转为 base64 dataUrl */
    fun imageToDataUrl(path: String): String? {
        val file = File(path)
        if (!file.exists()) return null
        return try {
            val bytes = FileInputStream(file).use { it.readBytes() }
            val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            "data:image/jpeg;base64,$b64"
        } catch (e: Exception) {
            null
        }
    }
}
