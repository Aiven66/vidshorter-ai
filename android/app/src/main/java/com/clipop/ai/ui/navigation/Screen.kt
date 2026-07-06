package com.clipop.ai.ui.navigation

sealed class Screen(val route: String) {
    data object Login : Screen("login")
    data object Home : Screen("home")
    data object JobDetail : Screen("job/{jobId}") {
        fun createRoute(jobId: String) = "job/$jobId"
    }
    data object Settings : Screen("settings")
}
