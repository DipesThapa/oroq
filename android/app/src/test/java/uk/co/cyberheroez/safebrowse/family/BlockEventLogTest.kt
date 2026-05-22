package uk.co.cyberheroez.safebrowse.family

import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class BlockEventLogTest {

    @get:Rule val tempFolder = TemporaryFolder()

    private fun newLog(max: Int = 50): Pair<BlockEventLog, File> {
        val file = File(tempFolder.newFolder(), "blocks.json")
        return BlockEventLog(file, maxEvents = max) to file
    }

    @Test fun recordsAndReadsBackRecentEventsNewestFirst() {
        val (log, _) = newLog()
        log.record("web", "a.com", at = 100)
        log.record("app", "TikTok", at = 200)
        val recent = log.recent(10)
        assertEquals(2, recent.size)
        assertEquals("TikTok", recent[0].label)
        assertEquals("a.com", recent[1].label)
    }

    @Test fun capsAtMaxEvents() {
        val (log, _) = newLog(max = 3)
        for (i in 1..6) log.record("web", "site$i.com", at = i.toLong())
        val recent = log.recent(100)
        assertEquals(3, recent.size)
        assertEquals("site6.com", recent[0].label)
    }

    @Test fun persistsAcrossInstances() {
        val (log, file) = newLog()
        log.record("web", "a.com", at = 100)
        val reopened = BlockEventLog(file)
        assertEquals("a.com", reopened.recent(10).single().label)
    }

    @Test fun countsByTypeSinceAGivenTime() {
        val (log, _) = newLog()
        log.record("web", "old.com", at = 50)
        log.record("web", "new.com", at = 150)
        log.record("app", "App", at = 160)
        assertEquals(1, log.countSince("web", since = 100))
        assertEquals(1, log.countSince("app", since = 100))
    }
}
