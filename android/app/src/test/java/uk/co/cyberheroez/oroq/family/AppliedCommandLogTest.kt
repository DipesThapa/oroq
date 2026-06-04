package uk.co.cyberheroez.oroq.family

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class AppliedCommandLogTest {

    @get:Rule val tempFolder = TemporaryFolder()

    private fun newLog(max: Int = 100): Pair<AppliedCommandLog, File> {
        val file = File(tempFolder.newFolder(), "applied.json")
        return AppliedCommandLog(file, maxIds = max) to file
    }

    @Test fun unseenIdIsNotContained() {
        val (log, _) = newLog()
        assertFalse(log.contains("c1"))
    }

    @Test fun markedIdIsContainedAndPersists() {
        val (log, file) = newLog()
        log.markApplied("c1")
        assertTrue(log.contains("c1"))
        assertTrue(AppliedCommandLog(file).contains("c1"))
    }

    @Test fun oldestIdsDropPastTheCap() {
        val (log, _) = newLog(max = 3)
        for (i in 1..5) log.markApplied("c$i")
        assertFalse(log.contains("c1"))
        assertTrue(log.contains("c5"))
    }
}
