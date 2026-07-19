package com.clipop.agent

import android.app.Application
import android.util.Log

/**
 * Application class — initializes global state and uncaught exception handler.
 *
 * Mirrors macos-agent/main.js behavior: capture uncaughtException and
 * unhandledRejection so we can log them to a local log buffer for debugging.
 */
class ClipopApp : Application() {

    companion object {
        private const val TAG = "ClipopApp"
        lateinit var instance: ClipopApp
            private set
    }

    override fun onCreate() {
        super.onCreate()
        instance = this

        // Global uncaught exception handler — log to logcat AND keep running
        val previousHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e(TAG, "UncaughtException on ${thread.name}: ${throwable.stackTraceToString()}")
            previousHandler?.uncaughtException(thread, throwable)
        }
    }
}
