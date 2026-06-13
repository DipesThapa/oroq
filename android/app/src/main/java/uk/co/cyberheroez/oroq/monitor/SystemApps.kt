package uk.co.cyberheroez.oroq.monitor

import android.content.Context
import android.content.Intent
import android.telecom.TelecomManager

/**
 * Packages OroQ must never block, or it would brick the device (and trip Play
 * review). The current home launcher and default dialer are resolved at runtime
 * by [systemCriticalApps]; the static set covers OS surfaces an emergency or
 * recovery action needs.
 */
fun systemCriticalPackages(home: String?, dialer: String?, ownPackage: String): Set<String> {
    val set = mutableSetOf(
        ownPackage,
        "com.android.settings",
        "com.android.systemui",
        "com.android.vending",          // Play Store
        "com.google.android.dialer",    // common stock dialer
        "com.android.phone",            // emergency / telephony UI
        "com.android.emergency",
    )
    if (!home.isNullOrBlank()) set.add(home)
    if (!dialer.isNullOrBlank()) set.add(dialer)
    return set
}

/** Resolves the live system-critical set for [context]. */
fun systemCriticalApps(context: Context): Set<String> {
    val pm = context.packageManager
    val home = runCatching {
        pm.resolveActivity(
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0,
        )?.activityInfo?.packageName
    }.getOrNull()
    val dialer = runCatching {
        (context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager)?.defaultDialerPackage
    }.getOrNull()
    return systemCriticalPackages(home, dialer, context.packageName)
}
