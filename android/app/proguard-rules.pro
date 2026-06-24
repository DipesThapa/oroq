# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# Keep crash-trace line numbers (Play symbolicates these).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# --- Tink (end-to-end pairing crypto) ---------------------------------------
# Tink resolves key managers and protobuf messages reflectively; R8 must not
# strip or rename them or hybrid encrypt/decrypt fails at runtime.
-keep class com.google.crypto.tink.** { *; }
-keepclassmembers class com.google.crypto.tink.** { *; }
-keep class com.google.protobuf.** { *; }
-keepclassmembers class * extends com.google.protobuf.GeneratedMessageLite { *; }
-dontwarn com.google.crypto.tink.**
-dontwarn com.google.protobuf.**
-dontwarn javax.annotation.**

# --- org.json wire models ---------------------------------------------------
# FamilySummary / FamilyCommand are (de)serialised by hand via org.json (no
# reflection), so no keeps are strictly required — but keep the family data
# classes to be safe against accidental shrink of fields read elsewhere.
-keep class uk.co.cyberheroez.oroq.family.** { *; }

# --- WorkManager + Room (family sync runs on WorkManager) -------------------
# WorkManager initialises a Room-backed WorkDatabase at startup; R8 must keep
# Room's generated *_Impl classes or the app crashes on launch.
-keep class androidx.work.** { *; }
-keep class androidx.work.impl.** { *; }
-keep class androidx.room.** { *; }
-keep class androidx.sqlite.** { *; }
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep @androidx.room.Database class * { *; }
-dontwarn androidx.work.**
-dontwarn androidx.room.**

# Firebase Messaging and Credential Manager ship their own consumer rules;
# suppress notes for their optional transitive deps.
-dontwarn com.google.android.gms.**

# --- Strip verbose/debug logging from release builds ------------------------
# The VPN logs DNS query domains (the child's browsing history) at Log.d. This
# removes Log.v/Log.d calls in release so none of that PII reaches logcat in a
# shipped build; info/warn/error are kept. (Audit M5.)
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
}