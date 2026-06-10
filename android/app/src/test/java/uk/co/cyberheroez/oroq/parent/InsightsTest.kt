package uk.co.cyberheroez.oroq.parent

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import uk.co.cyberheroez.oroq.family.BlockEvent
import uk.co.cyberheroez.oroq.family.FamilySummary

class InsightsTest {
    private val now = 1_700_000_000_000L
    private val hour = 3_600_000L
    private val day = 24 * hour

    private fun snap(
        protectionOn: Boolean = true,
        fetchedAt: Long = now,
        events: List<BlockEvent> = emptyList(),
    ) = ChildSnapshot(
        pairingId = "p1", label = "Mia",
        summary = FamilySummary(
            ts = fetchedAt, protectionOn = protectionOn,
            screenTimeTodayMin = 0, dailyLimitMin = 0, recentEvents = events,
        ),
        fetchedAt = fetchedAt,
    )

    @Test
    fun `empty family scores zero and counts nothing`() {
        val stats = Insights.derive(emptyList(), now)
        assertEquals(0, stats.threatsBlockedWeek)
        assertEquals(0, stats.unsafeDomainsWeek)
        assertEquals(0, stats.devicesProtected)
        assertEquals(0, stats.score)
    }

    @Test
    fun `week window includes 6-day-old event and excludes 8-day-old`() {
        val events = listOf(
            BlockEvent(now - 6 * day, "web", "a.example", cat = "phishing"),
            BlockEvent(now - 8 * day, "web", "b.example", cat = "phishing"),
        )
        val stats = Insights.derive(listOf(snap(events = events)), now)
        assertEquals(1, stats.threatsBlockedWeek)
        assertEquals(1, stats.unsafeDomainsWeek)
    }

    @Test
    fun `unsafe domains are distinct, threats are total`() {
        val events = listOf(
            BlockEvent(now - hour, "web", "same.example", cat = "malware"),
            BlockEvent(now - 2 * hour, "web", "same.example", cat = "malware"),
        )
        val stats = Insights.derive(listOf(snap(events = events)), now)
        assertEquals(2, stats.threatsBlockedWeek)
        assertEquals(1, stats.unsafeDomainsWeek)
    }

    @Test
    fun `app blocks and catless events do not count as threats`() {
        val events = listOf(
            BlockEvent(now - hour, "app", "TikTok"),
            BlockEvent(now - hour, "web", "legacy.example"), // no cat — legacy child
        )
        val stats = Insights.derive(listOf(snap(events = events)), now)
        assertEquals(0, stats.threatsBlockedWeek)
        assertEquals(0, stats.unsafeDomainsWeek)
    }

    @Test
    fun `device protected only when protection on and sync fresh`() {
        val fresh = snap(protectionOn = true, fetchedAt = now - hour)
        val stale = snap(protectionOn = true, fetchedAt = now - 2 * day)
        val off = snap(protectionOn = false, fetchedAt = now)
        assertEquals(1, Insights.derive(listOf(fresh, stale, off), now).devicesProtected)
    }

    @Test
    fun `perfect family scores 100 and threshold words match deck`() {
        val stats = Insights.derive(listOf(snap()), now)
        assertEquals(100, stats.score)
        assertEquals("Excellent", ConfidenceScore.statusWord(100))
        assertEquals("Excellent", ConfidenceScore.statusWord(80))
        assertEquals("Fair", ConfidenceScore.statusWord(79))
        assertEquals("Fair", ConfidenceScore.statusWord(60))
        assertEquals("At risk", ConfidenceScore.statusWord(59))
    }

    @Test
    fun `score degrades with stale sync and protection off`() {
        val all = Insights.derive(listOf(snap()), now).score
        val staleScore = Insights.derive(listOf(snap(fetchedAt = now - 3 * day)), now).score
        val offScore = Insights.derive(listOf(snap(protectionOn = false)), now).score
        assertTrue(staleScore < all)
        assertTrue(offScore < staleScore)
    }
}
