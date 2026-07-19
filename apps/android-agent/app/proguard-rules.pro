# ProGuard rules for Clipop Agent
# Webkit/WebView classes must not be obfuscated.
-keep class android.webkit.** { *; }
-keep class org.chromium.** { *; }

# NanoHTTPD
-keep class org.nanohttpd.** { *; }
-keep class fi.iki.elonen.** { *; }

# JS Bridge methods (called via reflection from WebView)
-keepclassmembers class com.clipop.agent.** {
    @android.webkit.JavascriptInterface <methods>;
}
-keep @android.webkit.JavascriptInterface class * { *; }

# Keep all classes in our app package (safety for JS bridge reflection)
-keep class com.clipop.agent.** { *; }
