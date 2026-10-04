# CashFlow ProGuard Rules — Production Build
# These rules prevent ProGuard from stripping classes that React Native
# and Expo access via reflection at runtime.

# ── React Native core ────────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# ── Expo modules ─────────────────────────────────────────────────
-keep class expo.modules.** { *; }
-dontwarn expo.modules.**

# ── expo-notifications: keeps alarm + broadcast receiver classes ─
# Without these, scheduled notifications are silently dropped in
# release builds because ProGuard strips the AlarmManager receivers.
-keep class expo.modules.notifications.** { *; }
-keep class * extends android.content.BroadcastReceiver { *; }
-keep class * extends android.app.Service { *; }

# ── Firebase / FCM (needed for push token registration) ─────────
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ── Supabase / OkHttp / networking ───────────────────────────────
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# ── SecureStore / Keystore ───────────────────────────────────────
-keep class expo.modules.securestore.** { *; }

# ── Keep enums intact (React Native uses them via reflection) ────
-keepclassmembers enum * { *; }

# ── Keep Parcelable implementations ─────────────────────────────
-keepclassmembers class * implements android.os.Parcelable {
  static ** CREATOR;
}

# ── Keep serializable classes ────────────────────────────────────
-keepclassmembers class * implements java.io.Serializable {
  static final long serialVersionUID;
  private static final java.io.ObjectStreamField[] serialPersistentFields;
  private void writeObject(java.io.ObjectOutputStream);
  private void readObject(java.io.ObjectInputStream);
  java.lang.Object writeReplace();
  java.lang.Object readResolve();
}

# ── Line numbers in stack traces (helpful for crash reports) ─────
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile