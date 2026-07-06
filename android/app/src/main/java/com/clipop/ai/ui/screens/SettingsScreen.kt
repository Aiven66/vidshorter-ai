package com.clipop.ai.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.clipop.ai.ui.MainViewModel

/**
 * 设置页：配置服务器地址、Agent Secret、Agent ID。
 * 对齐 macOS 客户端 install --server <url> --secret <AGENT_SECRET> --agentId <id> 的配置项。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: MainViewModel,
    onBack: () -> Unit
) {
    val serverUrl by viewModel.serverUrl
    val agentSecret by viewModel.agentSecret
    val agentId by viewModel.agentId

    var serverInput by remember(serverUrl) { mutableStateOf(serverUrl) }
    var secretInput by remember(agentSecret) { mutableStateOf(agentSecret) }
    var agentIdInput by remember(agentId) { mutableStateOf(agentId) }
    var showSecret by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // 服务器地址
            SectionCard(title = "Server Configuration") {
                OutlinedTextField(
                    value = serverInput,
                    onValueChange = { serverInput = it },
                    label = { Text("Server URL") },
                    placeholder = { Text("https://www.clipopai.com") },
                    leadingIcon = { Icon(Icons.Default.Cloud, contentDescription = null) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Button(
                    onClick = { viewModel.saveServerUrl(serverInput) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Save Server URL")
                }
            }

            // Agent 配置
            SectionCard(title = "Agent Configuration") {
                OutlinedTextField(
                    value = secretInput,
                    onValueChange = { secretInput = it },
                    label = { Text("Agent Secret") },
                    placeholder = { Text("(leave empty if not set)") },
                    leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                    trailingIcon = {
                        IconButton(onClick = { showSecret = !showSecret }) {
                            Icon(
                                if (showSecret) Icons.Default.VisibilityOff
                                else Icons.Default.Visibility,
                                contentDescription = "Toggle visibility"
                            )
                        }
                    },
                    visualTransformation = if (showSecret) VisualTransformation.None
                                           else PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                OutlinedTextField(
                    value = agentIdInput,
                    onValueChange = { agentIdInput = it },
                    label = { Text("Agent ID") },
                    placeholder = { Text("agent-android-xxx") },
                    leadingIcon = { Icon(Icons.Default.Badge, contentDescription = null) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Button(
                    onClick = {
                        viewModel.saveAgentSecret(secretInput)
                        viewModel.saveAgentId(agentIdInput)
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Save Agent Config")
                }
            }

            // 说明
            SectionCard(title = "How it works") {
                Text(
                    "Clipop AI Android Agent runs as a foreground service. " +
                        "It polls the server for video processing jobs, downloads source videos " +
                        "using your device's network, generates clips with FFmpeg, and reports " +
                        "results back to the server.\n\n" +
                        "Configure the server URL to point to your Clipop AI deployment. " +
                        "Set the Agent Secret if your server requires it (matches AGENT_SECRET env var).",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun SectionCard(
    title: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            content()
        }
    }
}
