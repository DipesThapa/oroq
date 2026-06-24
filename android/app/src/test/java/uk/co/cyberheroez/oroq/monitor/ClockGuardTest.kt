package uk.co.cyberheroez.oroq.monitor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ClockGuardTest {

    @Test fun firstCheckAnchorsAndTrustsWallClock() {
        val c = ClockGuard.check(prev = null, wallMs = 1_000_000, elapsedMs = 5_000)
        assertFalse(c.tampered)
        assertEquals(1_000_000, c.trustedWallMs)
        assertEquals(ClockAnchor(1_000_000, 5_000), c.anchor)
    }

    @Test fun consistentAdvanceIsNotTamperingAndReanchors() {
        val anchor = ClockAnchor(wallMs = 1_000_000, elapsedMs = 5_000)
        // 30 s of real time passed; wall advanced the same 30 s.
        val c = ClockGuard.check(anchor, wallMs = 1_030_000, elapsedMs = 35_000)
        assertFalse(c.tampered)
        assertEquals(1_030_000, c.trustedWallMs)
        assertEquals(ClockAnchor(1_030_000, 35_000), c.anchor)
    }

    @Test fun wallJumpForwardIsTamperingAndTrustedTimeIsProjected() {
        val anchor = ClockAnchor(wallMs = 1_000_000, elapsedMs = 5_000)
        // Only 30 s of monotonic time, but the wall clock leapt an hour ahead.
        val c = ClockGuard.check(anchor, wallMs = 1_000_000 + 3_600_000, elapsedMs = 35_000)
        assertTrue(c.tampered)
        // Trusted time tracks real elapsed (anchor + 30 s), not the spoofed wall.
        assertEquals(1_030_000, c.trustedWallMs)
        // Anchor is NOT advanced to the spoofed value.
        assertEquals(anchor, c.anchor)
    }

    @Test fun wallJumpBackwardIsTampering() {
        val anchor = ClockAnchor(wallMs = 1_000_000, elapsedMs = 5_000)
        val c = ClockGuard.check(anchor, wallMs = 1_000_000 - 3_600_000, elapsedMs = 35_000)
        assertTrue(c.tampered)
        assertEquals(1_030_000, c.trustedWallMs)
    }

    @Test fun smallDriftWithinToleranceIsAccepted() {
        val anchor = ClockAnchor(wallMs = 1_000_000, elapsedMs = 5_000)
        // Wall is 60 s off expected (1_030_000) — under the 5-min tolerance.
        val c = ClockGuard.check(anchor, wallMs = 1_030_000 + 60_000, elapsedMs = 35_000)
        assertFalse(c.tampered)
    }

    @Test fun elapsedGoingBackwardsMeansRebootAndReanchors() {
        val anchor = ClockAnchor(wallMs = 1_000_000, elapsedMs = 9_000_000)
        // elapsedRealtime reset (smaller than the anchor) → reboot; trust the wall.
        val c = ClockGuard.check(anchor, wallMs = 2_000_000, elapsedMs = 4_000)
        assertFalse(c.tampered)
        assertEquals(2_000_000, c.trustedWallMs)
        assertEquals(ClockAnchor(2_000_000, 4_000), c.anchor)
    }
}
