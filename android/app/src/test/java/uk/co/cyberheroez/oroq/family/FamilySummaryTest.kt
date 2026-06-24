package uk.co.cyberheroez.oroq.family

import org.junit.Assert.assertEquals
import org.junit.Test

class FamilySummaryTest {

    private val sample = FamilySummary(
        ts = 1_716_000_000_000L,
        protectionOn = true,
        screenTimeTodayMin = 275,
        dailyLimitMin = 120,
        topApps = listOf(TopApp("YouTube", 90), TopApp("Chrome", 40)),
        webBlockedToday = 12,
        appBlockedToday = 3,
        recentEvents = listOf(
            BlockEvent(1_716_000_000_001L, "web", "example-adult-site.com"),
            BlockEvent(1_716_000_000_002L, "app", "TikTok"),
        ),
        categories = setOf("adult", "gambling"),
        installedApps = listOf(
            InstalledApp("com.instagram.android", "Instagram"),
            InstalledApp("com.zhiliaoapp.musically", "TikTok"),
        ),
        blockedApps = setOf("com.zhiliaoapp.musically"),
    )

    @Test fun jsonRoundTrips() {
        val restored = parseSummary(sample.toJson())
        assertEquals(sample, restored)
    }

    @Test fun toleratesMissingOptionalFields() {
        val minimal = """{"ts":1,"protectionOn":false,"screenTimeTodayMin":0,""" +
            """"dailyLimitMin":0,"webBlockedToday":0,"appBlockedToday":0}"""
        val parsed = parseSummary(minimal)
        assertEquals(emptyList<TopApp>(), parsed.topApps)
        assertEquals(emptyList<BlockEvent>(), parsed.recentEvents)
        assertEquals(emptySet<String>(), parsed.categories)
        assertEquals(emptyList<InstalledApp>(), parsed.installedApps)
        assertEquals(emptySet<String>(), parsed.blockedApps)
    }

    @Test fun heartbeatAndPerAppFieldsRoundTrip() {
        val summary = FamilySummary(
            ts = 123L,
            protectionOn = true,
            screenTimeTodayMin = 30,
            dailyLimitMin = 120,
            permissionsOk = false,
            approvedApps = setOf("com.ok"),
            schedules = mapOf(
                "com.tiktok" to listOf(
                    uk.co.cyberheroez.oroq.monitor.Window(
                        1260, 420, java.time.DayOfWeek.values().toSet(),
                    ),
                ),
            ),
        )
        val restored = parseSummary(summary.toJson())
        assertEquals(false, restored.permissionsOk)
        assertEquals(setOf("com.ok"), restored.approvedApps)
        assertEquals(summary.schedules, restored.schedules)
    }

    @Test fun missingHeartbeatFieldsDefault() {
        // Old children won't send the new fields; parse must default safely.
        val json = org.json.JSONObject()
            .put("ts", 1L).put("protectionOn", true)
            .put("screenTimeTodayMin", 0).put("dailyLimitMin", 0)
            .put("webBlockedToday", 0).put("appBlockedToday", 0)
            .toString()
        val s = parseSummary(json)
        assertEquals(true, s.permissionsOk) // default = assume ok for legacy
        assertEquals(emptySet<String>(), s.approvedApps)
        assertEquals(emptyMap<String, List<uk.co.cyberheroez.oroq.monitor.Window>>(), s.schedules)
    }

    @Test fun buildSummaryAssemblesFieldsAndTopFive() {
        val apps = listOf(
            InstalledApp("com.a", "App A"),
            InstalledApp("com.b", "App B"),
            InstalledApp("com.c", "App C"),
            InstalledApp("com.d", "App D"),
            InstalledApp("com.e", "App E"),
            InstalledApp("com.f", "App F"),
        )
        val usage = linkedMapOf(
            "com.a" to 50, "com.b" to 40, "com.c" to 30,
            "com.d" to 20, "com.e" to 10, "com.f" to 5,
        )
        val events = listOf(
            BlockEvent(10, "web", "x.com"),
            BlockEvent(20, "app", "TikTok"),
        )
        val summary = buildSummary(
            now = 999,
            protectionOn = true,
            dailyLimitMinutes = 120,
            usageByApp = usage,
            recentEvents = events,
            webBlockedToday = 7,
            appBlockedToday = 2,
            categories = setOf("adult", "social"),
            installedApps = apps,
            blockedApps = setOf("com.a"),
        )
        assertEquals(999, summary.ts)
        assertEquals(155, summary.screenTimeTodayMin)
        assertEquals(5, summary.topApps.size)
        assertEquals(setOf("adult", "social"), summary.categories)
        assertEquals(apps, summary.installedApps)
        assertEquals(setOf("com.a"), summary.blockedApps)
    }

    @Test fun buildSummaryDropsSystemAppsFromBreakdown() {
        // Usage includes the launcher, Play Services, and OroQ itself — none of
        // which are in the launchable user-app list. The breakdown must list only
        // the recognised app, while the total still counts all foreground time.
        val usage = linkedMapOf(
            "com.google.android.apps.nexuslauncher" to 38,
            "com.google.android.gms" to 16,
            "uk.co.cyberheroez.oroq" to 1,
            "com.instagram.android" to 22,
        )
        val summary = buildSummary(
            now = 1L,
            protectionOn = true,
            dailyLimitMinutes = 0,
            usageByApp = usage,
            recentEvents = emptyList(),
            webBlockedToday = 0,
            appBlockedToday = 0,
            categories = emptySet(),
            installedApps = listOf(InstalledApp("com.instagram.android", "Instagram")),
            blockedApps = emptySet(),
        )
        assertEquals(77, summary.screenTimeTodayMin) // total counts every app
        assertEquals(listOf(TopApp("com.instagram.android", 22)), summary.topApps)
    }
}
