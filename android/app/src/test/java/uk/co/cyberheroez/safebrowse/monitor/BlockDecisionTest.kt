package uk.co.cyberheroez.safebrowse.monitor

import org.junit.Assert.assertEquals
import org.junit.Test

class BlockDecisionTest {

    @Test fun blockedAppIsBlocked() {
        assertEquals(
            BlockDecision.BLOCK_APP,
            decideBlock("com.bad.app", 10, setOf("com.bad.app"), 120, 0),
        )
    }

    @Test fun unblockedAppUnderLimitIsAllowed() {
        assertEquals(
            BlockDecision.ALLOW,
            decideBlock("com.ok.app", 10, setOf("com.bad.app"), 120, 0),
        )
    }

    @Test fun reachingTheLimitGivesTimeUp() {
        assertEquals(
            BlockDecision.TIME_UP,
            decideBlock("com.ok.app", 120, emptySet(), 120, 0),
        )
    }

    @Test fun extraMinutesPostponeTimeUp() {
        assertEquals(BlockDecision.ALLOW, decideBlock("com.ok.app", 130, emptySet(), 120, 30))
        assertEquals(BlockDecision.TIME_UP, decideBlock("com.ok.app", 150, emptySet(), 120, 30))
    }

    @Test fun zeroLimitMeansNoTimeUp() {
        assertEquals(BlockDecision.ALLOW, decideBlock("com.ok.app", 999, emptySet(), 0, 0))
    }

    @Test fun blockedAppTakesPrecedenceOverTimeUp() {
        assertEquals(
            BlockDecision.BLOCK_APP,
            decideBlock("com.bad.app", 999, setOf("com.bad.app"), 120, 0),
        )
    }

    @Test fun nullForegroundAppNeverBlocksApp() {
        assertEquals(BlockDecision.ALLOW, decideBlock(null, 10, setOf("com.bad.app"), 0, 0))
    }

    @Test fun extraMinutesOnlyCountOnTheDayGranted() {
        assertEquals(30, effectiveExtraMinutes(30, "2026-05-22", "2026-05-22"))
        assertEquals(0, effectiveExtraMinutes(30, "2026-05-21", "2026-05-22"))
    }
}
