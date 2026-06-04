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

    @Test fun buildSummaryAssemblesFieldsAndTopFive() {
        val usage = linkedMapOf(
            "A" to 50, "B" to 40, "C" to 30, "D" to 20, "E" to 10, "F" to 5,
        )
        val events = listOf(
            BlockEvent(10, "web", "x.com"),
            BlockEvent(20, "app", "TikTok"),
        )
        val apps = listOf(
            InstalledApp("com.a", "App A"),
            InstalledApp("com.b", "App B"),
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
}
