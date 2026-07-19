plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.clipop.agent"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.clipop.agent"
        minSdk = 26
        targetSdk = 34
        versionCode = 930
        versionName = "0.9.30"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
    }

    signingConfigs {
        create("release") {
            // Loaded from environment in GitHub Actions.
            // Local dev: create keystore.properties (see README) or use debug keystore.
            val storeFilePath = System.getenv("SIGNING_KEYSTORE_FILE")
            val storePasswordVal = System.getenv("SIGNING_STORE_PASSWORD")
            val keyAliasVal = System.getenv("SIGNING_KEY_ALIAS")
            val keyPasswordVal = System.getenv("SIGNING_KEY_PASSWORD")
            if (!storeFilePath.isNullOrEmpty()) {
                storeFile = file(storeFilePath)
                storePassword = storePasswordVal ?: ""
                keyAlias = keyAliasVal ?: ""
                keyPassword = keyPasswordVal ?: ""
            }
        }
    }

    buildTypes {
        debug {
            isDebuggable = true
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            // Sign with debug keystore by default (release build needs env vars above).
            // GitHub Actions workflow configures the proper release keystore.
            val storeFilePath = System.getenv("SIGNING_KEYSTORE_FILE")
            if (!storeFilePath.isNullOrEmpty()) {
                signingConfig = signingConfigs.getByName("release")
            } else {
                signingConfig = signingConfigs.getByName("debug")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        viewBinding = false
        buildConfig = true
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
            excludes += "/META-INF/DEPENDENCIES"
        }
    }
}

dependencies {
    // Android core + WebView
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.webkit:webkit:1.12.1")

    // Material Design (themes/colors)
    implementation("com.google.android.material:material:1.12.0")

    // Chrome Custom Tabs — used to launch the OAuth flow in the system browser
    implementation("androidx.browser:browser:1.8.0")

    // NanoHTTPD — local HTTP callback server on 127.0.0.1
    implementation("org.nanohttpd:nanohttpd:2.3.1")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // NOTE: org.json is bundled with Android SDK — do NOT add as a dependency
    // (would cause "Type JSONObject is defined multiple times" build errors).

    // Tests
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
}
