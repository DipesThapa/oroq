package uk.co.cyberheroez.oroq.family

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SummaryCatTest {
    @Test
    fun `cat field round-trips through json`() {
        val s = FamilySummary(
            ts = 1L, protectionOn = true, screenTimeTodayMin = 0, dailyLimitMin = 0,
            recentEvents = listOf(BlockEvent(2L, "web", "x.example", cat = "phishing")),
        )
        val parsed = parseSummary(s.toJson())
        assertEquals("phishing", parsed.recentEvents[0].cat)
    }

    @Test
    fun `legacy json without cat parses as null`() {
        val legacy = """{"ts":1,"protectionOn":true,"screenTimeTodayMin":0,
            "dailyLimitMin":0,"webBlockedToday":0,"appBlockedToday":0,
            "recentEvents":[{"ts":2,"type":"web","label":"x.example"}]}"""
        assertNull(parseSummary(legacy).recentEvents[0].cat)
    }
}
