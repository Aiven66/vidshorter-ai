# Keep model classes
-keep class com.clipop.ai.data.** { *; }
-keep class com.clipop.ai.data.models.** { *; }

# Gson
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**

# FFmpegKit
-keep class com.arthenica.ffmpegkit.** { *; }
-dontwarn com.arthenica.ffmpegkit.**

# Kotlin Coroutines
-keepclassmembers class kotlinx.coroutines.** { *; }
