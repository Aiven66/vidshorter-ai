package com.clipop.ai

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.clipop.ai.data.models.AuthState
import com.clipop.ai.ui.MainViewModel
import com.clipop.ai.ui.screens.HomeScreen
import com.clipop.ai.ui.screens.JobDetailScreen
import com.clipop.ai.ui.screens.LoginScreen
import com.clipop.ai.ui.screens.SettingsScreen
import com.clipop.ai.ui.navigation.Screen
import com.clipop.ai.ui.theme.ClipopTheme

class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // 处理 deep link clipop://login-success?token=...
        intent?.let { handleDeepLink(it) }

        setContent {
            ClipopTheme {
                val authState by viewModel.authState.collectAsState()
                val navController = rememberNavController()

                val startDestination = if (authState.isLoggedIn) Screen.Home.route else Screen.Login.route

                NavHost(navController = navController, startDestination = startDestination) {
                    composable(Screen.Login.route) {
                        LoginScreen(
                            serverUrl = com.clipop.ai.data.ApiClient.DEFAULT_SERVER,
                            onLoginClick = { }
                        )
                    }
                    composable(Screen.Home.route) {
                        HomeScreen(
                            viewModel = viewModel,
                            onJobClick = { jobId ->
                                navController.navigate(Screen.JobDetail.createRoute(jobId))
                            },
                            onSettingsClick = {
                                navController.navigate(Screen.Settings.route)
                            },
                            onLogout = { viewModel.logout() }
                        )
                    }
                    composable(Screen.JobDetail.route) { backStackEntry ->
                        val jobId = backStackEntry.arguments?.getString("jobId") ?: ""
                        JobDetailScreen(
                            jobId = jobId,
                            viewModel = viewModel,
                            onBack = { navController.popBackStack() }
                        )
                    }
                    composable(Screen.Settings.route) {
                        SettingsScreen(
                            viewModel = viewModel,
                            onBack = { navController.popBackStack() }
                        )
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    /** 处理 deep link：clipop://login-success?token=... */
    private fun handleDeepLink(intent: Intent) {
        val uri = intent.data ?: return
        if (uri.scheme == "clipop" && uri.host == "login-success") {
            viewModel.handleDeepLink(uri)
        }
    }
}
