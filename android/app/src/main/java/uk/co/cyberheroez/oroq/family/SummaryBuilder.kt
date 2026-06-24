package uk.co.cyberheroez.oroq.family

/**
 * Assembles a [FamilySummary] from already-gathered inputs. Pure — the worker
 * does the I/O and passes the results in, so this stays unit-testable.
 */
fun buildSummary(
    now: Long,
    protectionOn: Boolean,
    dailyLimitMinutes: Int,
    usageByApp: Map<String, Int>,
    recentEvents: List<BlockEvent>,
    webBlockedToday: Int,
    appBlockedToday: Int,
    categories: Set<String>,
    installedApps: List<InstalledApp>,
    blockedApps: Set<String>,
    safeSearchOn: Boolean = false,
    ytRestrictedOn: Boolean = false,
    permissionsOk: Boolean = true,
    approvedApps: Set<String> = emptySet(),
    schedules: Map<String, List<uk.co.cyberheroez.oroq.monitor.Window>> = emptyMap(),
): FamilySummary {
    // The per-app breakdown only lists apps the parent recognises — launchable
    // user apps. This drops system noise (launcher, Play Services, Settings) and
    // OroQ itself, and guarantees every entry resolves to a friendly label parent-side.
    val userPackages = installedApps.mapTo(HashSet()) { it.packageName }
    val topApps = usageByApp.entries
        .filter { it.key in userPackages }
        .sortedByDescending { it.value }
        .take(5)
        .map { TopApp(it.key, it.value) }
    return FamilySummary(
        ts = now,
        protectionOn = protectionOn,
        screenTimeTodayMin = usageByApp.values.sum(),
        dailyLimitMin = dailyLimitMinutes,
        topApps = topApps,
        webBlockedToday = webBlockedToday,
        appBlockedToday = appBlockedToday,
        recentEvents = recentEvents,
        categories = categories,
        installedApps = installedApps,
        blockedApps = blockedApps,
        safeSearchOn = safeSearchOn,
        ytRestrictedOn = ytRestrictedOn,
        permissionsOk = permissionsOk,
        approvedApps = approvedApps,
        schedules = schedules,
    )
}
