package com.clipop.ai.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.clipop.ai.MainActivity
import com.clipop.ai.R
import com.clipop.ai.data.ApiClient
import com.clipop.ai.data.AuthManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * 前台 Agent Service，复刻 macOS runner.ts 的主循环：
 *   for(;;) { pull job → processJob → sleep(2s) }
 *
 * 作为 Android 前台 Service 运行，保证在后台持续轮询并处理 Job，
 * 利用设备网络出口下载视频（避免数据中心 IP 风控，与 macOS Agent 同理）。
 */
class AgentService : Service() {

    private val tag = "AgentService"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var loopJob: Job? = null

    companion object {
        const val CHANNEL_ID = "clipop_agent_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "com.clipop.ai.action.START"
        const val ACTION_STOP = "com.clipop.ai.action.STOP"

        @Volatile
        var isRunning = false
            private set

        fun start(context: Context) {
            val intent = Intent(context, AgentService::class.java).setAction(ACTION_START)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, AgentService::class.java).setAction(ACTION_STOP)
            context.startService(intent)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopLoop()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                startForeground(NOTIFICATION_ID, buildNotification("Agent running", "Waiting for jobs..."))
                startLoop()
            }
        }
        return START_STICKY
    }

    private fun startLoop() {
        if (loopJob?.isActive == true) return
        isRunning = true
        loopJob = scope.launch {
            val authManager = AuthManager(this@AgentService)
            val serverUrl = authManager.getServerUrl()
            val secret = authManager.getAgentSecret()
            val agentId = authManager.getAgentId()

            val api = ApiClient(serverUrl = serverUrl, agentSecret = secret)
            val processor = JobProcessor(this@AgentService, api, agentId)

            Log.i(tag, "Agent loop started: agentId=$agentId server=$serverUrl")

            while (true) {
                try {
                    val job = api.pullJob(agentId)
                    if (job != null) {
                        updateNotification("Processing job: ${job.id.take(12)}", job.videoUrl)
                        processor.processJob(job)
                        updateNotification("Agent running", "Waiting for jobs...")
                    } else {
                        delay(2000)
                    }
                } catch (e: Exception) {
                    Log.w(tag, "Agent loop error: ${e.message}")
                    delay(1500)
                }
            }
        }
    }

    private fun stopLoop() {
        isRunning = false
        loopJob?.cancel()
        loopJob = null
        Log.i(tag, "Agent loop stopped")
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Clipop Agent",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Background video processing agent"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(title: String, text: String): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification(title: String, text: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(title, text))
    }

    override fun onDestroy() {
        stopLoop()
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
