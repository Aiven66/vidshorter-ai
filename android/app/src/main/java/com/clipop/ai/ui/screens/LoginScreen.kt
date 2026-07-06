package com.clipop.ai.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material.icons.filled.Login
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.clipop.ai.data.ApiClient

/**
 * 登录页面，复刻 macOS 桌面端的 Web 登录流程：
 *   点击登录 → 打开 Web Custom Tab 登录 → 登录成功回调 deep link clipop://login-success
 */
@Composable
fun LoginScreen(
    serverUrl: String,
    onLoginClick: () -> Unit
) {
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.VideoLibrary,
            contentDescription = null,
            modifier = Modifier.size(72.dp),
            tint = MaterialTheme.colorScheme.primary
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text = "Clipop AI",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "Transform long videos into engaging short clips with AI",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(48.dp))

        Button(
            onClick = {
                val url = "${serverUrl.trimEnd('/')}/login?from=desktop&platform=android"
                val intent = CustomTabsIntent.Builder()
                    .setShowTitle(true)
                    .build()
                intent.launchUrl(context, Uri.parse(url))
                onLoginClick()
            },
            modifier = Modifier.fillMaxWidth().height(56.dp)
        ) {
            Icon(Icons.Default.Login, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            Text("Continue with Web Account")
        }

        Spacer(Modifier.height(16.dp))
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant,
            shape = MaterialTheme.shapes.medium,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = "For security, please log in through our web platform. " +
                    "After login, tap \"Return to Clipop Agent\" to sync your account.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(16.dp)
            )
        }

        Spacer(Modifier.height(24.dp))
        Text(
            text = "Server: ${serverUrl.ifBlank { ApiClient.DEFAULT_SERVER }}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
