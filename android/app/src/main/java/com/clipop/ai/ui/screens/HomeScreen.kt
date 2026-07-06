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
import com.clipop.ai.data.models.AgentJob
import com.clipop.ai.ui.MainViewModel

/**
 * 首页：视频提交 + Job 列表 + Agent Service 控制。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    viewModel: MainViewModel,
    onJobClick: (String) -> Unit,
    onSettingsClick: () -> Unit,
    onLogout: () -> Unit
) {
    val authState by viewModel.authState
    val jobs by viewModel.jobs
    val isLoading by viewModel.isLoading
    val error by viewModel.error
    val isAgentRunning by viewModel.isAgentRunning

    var videoUrl by remember { mutableStateOf("") }
    var clipCount by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Clipop AI") },
                actions = {
                    IconButton(onClick = onSettingsClick) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings")
                    }
                    IconButton(onClick = onLogout) {
                        Icon(Icons.Default.Logout, contentDescription = "Logout")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
        ) {
            // 用户信息
            authState.email?.let { email ->
                Text(
                    text = "Logged in as: $email",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
            }

            // Agent Service 控制
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = if (isAgentRunning)
                        MaterialTheme.colorScheme.primaryContainer
                    else MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = if (isAgentRunning) Icons.Default.PlayArrow else Icons.Default.Stop,
                        contentDescription = null,
                        tint = if (isAgentRunning) MaterialTheme.colorScheme.primary
                               else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (isAgentRunning) "Agent Running" else "Agent Stopped",
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = if (isAgentRunning) "Processing jobs in background"
                                   else "Start agent to process jobs",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Switch(
                        checked = isAgentRunning,
                        onCheckedChange = { viewModel.toggleAgent() }
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            // 视频提交表单
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "Create New Job",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.height(12.dp))

                    OutlinedTextField(
                        value = videoUrl,
                        onValueChange = { videoUrl = it },
                        label = { Text("YouTube / Bilibili URL") },
                        placeholder = { Text("https://youtube.com/watch?v=...") },
                        leadingIcon = { Icon(Icons.Default.VideoLibrary, contentDescription = null) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Spacer(Modifier.height(8.dp))

                    OutlinedTextField(
                        value = clipCount,
                        onValueChange = { clipCount = it.filter { c -> c.isDigit() } },
                        label = { Text("Clip count (optional)") },
                        placeholder = { Text("Auto") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Spacer(Modifier.height(12.dp))

                    Button(
                        onClick = {
                            viewModel.submitVideo(
                                videoUrl,
                                clipCount.toIntOrNull()
                            )
                            videoUrl = ""
                            clipCount = ""
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !isLoading && videoUrl.isNotBlank()
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary
                            )
                        } else {
                            Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(20.dp))
                        }
                        Spacer(Modifier.width(8.dp))
                        Text(if (isLoading) "Creating..." else "Analyze & Generate Clips")
                    }
                }
            }

            // 错误提示
            error?.let { msg ->
                Spacer(Modifier.height(8.dp))
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Warning, contentDescription = null,
                            tint = MaterialTheme.colorScheme.onErrorContainer)
                        Spacer(Modifier.width(8.dp))
                        Text(msg, style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onErrorContainer)
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            // Job 列表
            Text(
                "Jobs (${jobs.size})",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(Modifier.height(8.dp))

            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(jobs) { job ->
                    JobCard(job, onClick = { onJobClick(job.id) })
                }
            }
        }
    }
}

@Composable
private fun JobCard(job: AgentJob, onClick: () -> Unit) {
    val statusColor = when (job.status) {
        "completed" -> MaterialTheme.colorScheme.primary
        "processing" -> MaterialTheme.colorScheme.tertiary
        "failed" -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = job.result?.title ?: job.videoUrl.take(40),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1
                )
                Text(
                    text = job.message,
                    style = MaterialTheme.typography.bodySmall,
                    color = statusColor,
                    maxLines = 1
                )
            }
            if (job.status == "processing") {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    strokeWidth = 2.dp
                )
            }
            Spacer(Modifier.width(8.dp))
            Text(
                "${job.progress}%",
                style = MaterialTheme.typography.labelSmall,
                color = statusColor
            )
        }
    }
}
