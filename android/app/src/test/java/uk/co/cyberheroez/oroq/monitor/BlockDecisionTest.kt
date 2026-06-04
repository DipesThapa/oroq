package uk.co.cyberheroez.oroq.monitor

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

    @Test fun grantUnderLimitJustAddsGrantAsHeadroom() {
        // today 30 < limit 60 → no overage. Grant 30 → extra = 30.
        assertEquals(30, newExtraAfterGrant(currentExtra = 0, todayMinutes = 30, limitMinutes = 60, grant = 30))
    }

    @Test fun grantPastLimitGivesFullHeadroomFromNow() {
        // today 100, limit 60 → 40 over. Without this rule, grant 30 would
        // leave the child still TIME_UP (100 >= 60+30). With it, extra = 70.
        assertEquals(70, newExtraAfterGrant(currentExtra = 0, todayMinutes = 100, limitMinutes = 60, grant = 30))
        // decideBlock now allows: 100 >= 60 + 70 → 100 >= 130 → false → ALLOW.
        assertEquals(BlockDecision.ALLOW, decideBlock("com.ok.app", 100, emptySet(), 60, 70))
    }

    @Test fun grantIncrementsHeadroomWhenAlreadyAhead() {
        // Previous grant of 50 still has headroom (today 60, limit 60, extra 50 → headroom 50).
        // Granting 30 more should add to the existing buffer, not reset it.
        assertEquals(80, newExtraAfterGrant(currentExtra = 50, todayMinutes = 60, limitMinutes = 60, grant = 30))
    }

    @Test fun grantPastExpiredPriorGrantResetsBaselineToCurrentOverage() {
        // Previous grant 30 was consumed (today 110, limit 60 → overage 50 > extra 30).
        // New grant 30 should give 30 min from now → extra = 50 + 30 = 80.
        assertEquals(80, newExtraAfterGrant(currentExtra = 30, todayMinutes = 110, limitMinutes = 60, grant = 30))
    }
}
