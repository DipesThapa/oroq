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
): FamilySummary {
    val topApps = usageByApp.entries
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
    )
}
