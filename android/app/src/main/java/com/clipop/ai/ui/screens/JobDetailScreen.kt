package com.clipop.ai.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.clipop.ai.data.models.AgentClip
import com.clipop.ai.data.models.AgentJob
import com.clipop.ai.ui.MainViewModel

/**
 * Job 详情页：展示进度、视频信息、高光片段列表、剪辑预览。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JobDetailScreen(
    jobId: String,
    viewModel: MainViewModel,
    onBack: () -> Unit
) {
    val jobs by viewModel.jobs
    val job = jobs.find { it.id == jobId }

    LaunchedEffect(jobId) {
        viewModel.refreshJob(jobId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Job ${jobId.take(12)}...") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.refreshJob(jobId) }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                }
            )
        }
    ) { padding ->
        if (job == null) {
            Box(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center
            ) {
                Text("Job not found")
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // 进度卡片
            item { ProgressCard(job) }

            // 视频信息
            job.result?.let { result ->
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("Video Info", style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(8.dp))
                            result.title?.let { InfoRow("Title", it) }
                            if (result.duration > 0) {
                                InfoRow("Duration", formatDuration(result.duration))
                            }
                            InfoRow("Highlights", "${result.highlights.size} found")
                        }
                    }
                }

                // 剪辑列表
                if (result.clips.isNotEmpty()) {
                    item {
                        Text(
                            "Clips (${result.clips.size})",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    items(result.clips) { clip ->
                        ClipCard(clip)
                    }
                }
            }

            // 原始 URL
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Source URL", style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(job.videoUrl, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }

            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun ProgressCard(job: AgentJob) {
    val statusColor = when (job.status) {
        "completed" -> MaterialTheme.colorScheme.primary
        "processing" -> MaterialTheme.colorScheme.tertiary
        "failed" -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    job.status.replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.titleMedium,
                    color = statusColor,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.weight(1f))
                Text("${job.progress}%", style = MaterialTheme.typography.headlineSmall,
                    color = statusColor, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(8.dp))
            if (job.status == "processing") {
                LinearProgressIndicator(
                    progress = { job.progress / 100f },
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(job.message, style = MaterialTheme.typography.bodyMedium)
            job.error?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(modifier = Modifier.padding(vertical = 2.dp)) {
        Text(
            "$label: ",
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium
        )
        Text(value, style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ClipCard(clip: AgentClip) {
    val statusIcon = when (clip.status) {
        "completed" -> Icons.Default.CheckCircle
        "processing" -> Icons.Default.Schedule
        "failed" -> Icons.Default.Error
        else -> Icons.Default.QuestionMark
    }
    val statusColor = when (clip.status) {
        "completed" -> MaterialTheme.colorScheme.primary
        "processing" -> MaterialTheme.colorScheme.tertiary
        "failed" -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            Icon(statusIcon, contentDescription = null, tint = statusColor,
                modifier = Modifier.padding(top = 2.dp))
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(clip.title, style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium)
                Text(
                    "${formatDuration(clip.startTime.toLong())} - ${formatDuration(clip.endTime.toLong())} (${clip.duration}s)",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (clip.summary.isNotBlank()) {
                    Text(clip.summary, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                }
                clip.error?.let {
                    Text(it, style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error, maxLines = 2)
                }
            }
        }
    }
}

private fun formatDuration(seconds: Long): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return if (h > 0) String.format("%d:%02d:%02d", h, m, s)
           else String.format("%02d:%02d", m, s)
}
