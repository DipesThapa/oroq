package uk.co.cyberheroez.safebrowse.family

import android.content.Context
import android.content.pm.ApplicationInfo

/**
 * Returns the user-installed apps on this device, sorted by display label.
 *
 * "User-installed" means anything without `FLAG_SYSTEM` AND without
 * `FLAG_UPDATED_SYSTEM_APP` — the latter excludes preinstalled apps that
 * later received an OTA update (Android clears `FLAG_SYSTEM` on those, so
 * checking it alone would let Settings/Phone leak through).
 *
 * SafeBrowse itself is filtered out so the parent picker can't ask the child
 * to block the parental-control app.
 */
fun listUserApps(context: Context): List<InstalledApp> {
    val pm = context.packageManager
    val ownPackage = context.packageName
    val flags = ApplicationInfo.FLAG_SYSTEM or ApplicationInfo.FLAG_UPDATED_SYSTEM_APP
    return pm.getInstalledApplications(0)
        .asSequence()
        .filter { it.packageName != ownPackage }
        .filter { (it.flags and flags) == 0 }
        .map { InstalledApp(it.packageName, it.loadLabel(pm).toString()) }
        .sortedBy { it.label.lowercase() }
        .toList()
}
