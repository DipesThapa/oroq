package uk.co.cyberheroez.oroq.family

import android.content.Context
import android.content.Intent

/**
 * Returns the apps a child can actually launch from the app drawer, sorted by
 * display label.
 *
 * We query MAIN/LAUNCHER intents rather than filtering `getInstalledApplications`
 * by `FLAG_SYSTEM`, because on most real Android phones the apps a parent would
 * want to block (TikTok, Instagram, FB Messenger on Vivo/Xiaomi; the Google
 * suite on stock) are preinstalled as system apps — a flag-based filter would
 * hide them all. The launcher-intent approach captures every tappable app
 * (Chrome, Settings, Phone, sideloaded games) while excluding background
 * services that have no UI.
 *
 * SafeBrowse itself is filtered out so the parent picker can't ask the child
 * to block the parental-control app.
 */
fun listUserApps(context: Context): List<InstalledApp> {
    val pm = context.packageManager
    val ownPackage = context.packageName
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    return pm.queryIntentActivities(intent, 0)
        .asSequence()
        .map { it.activityInfo.applicationInfo }
        .distinctBy { it.packageName }
        .filter { it.packageName != ownPackage }
        .map { InstalledApp(it.packageName, it.loadLabel(pm).toString()) }
        .sortedBy { it.label.lowercase() }
        .toList()
}
