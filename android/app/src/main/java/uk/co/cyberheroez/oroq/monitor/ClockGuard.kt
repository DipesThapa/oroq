package uk.co.cyberheroez.oroq.monitor

import kotlin.math.abs

/** A point tying wall-clock time to the monotonic clock at one instant. */
data class ClockAnchor(val wallMs: Long, val elapsedMs: Long)

/** Outcome of a clock check: the time to trust, whether tampering was seen, and
 *  the anchor to persist for next time. */
data class ClockCheck(val trustedWallMs: Long, val tampered: Boolean, val anchor: ClockAnchor)

/**
 * Detects wall-clock tampering by comparing `System.currentTimeMillis()` against
 * the monotonic `SystemClock.elapsedRealtime()`. A child can change the device
 * clock (no root needed) to skip a curfew window or reset a daily limit; this
 * projects a *trusted* time from a persisted anchor so schedule decisions use
 * real elapsed time instead of the spoofed wall clock.
 *
 * Pure and Android-free so the logic is unit-testable.
 */
object ClockGuard {
    /** Wall-vs-monotonic drift beyond this is treated as tampering. Well above
     *  NTP jitter (sub-second) and ordinary scheduling slack, so legitimate time
     *  sync never trips it; only a manual clock change does. */
    const val TOLERANCE_MS = 5 * 60 * 1000L

    fun check(prev: ClockAnchor?, wallMs: Long, elapsedMs: Long): ClockCheck {
        if (prev == null) return ClockCheck(wallMs, false, ClockAnchor(wallMs, elapsedMs))

        val elapsedDelta = elapsedMs - prev.elapsedMs
        if (elapsedDelta < 0) {
            // elapsedRealtime resets at boot — a reboot happened. We can't judge
            // across it without trusted external time, so re-anchor and trust the
            // wall clock for now.
            return ClockCheck(wallMs, false, ClockAnchor(wallMs, elapsedMs))
        }

        val expectedWall = prev.wallMs + elapsedDelta
        if (abs(wallMs - expectedWall) > TOLERANCE_MS) {
            // The wall clock moved relative to monotonic time → tampering. Trust
            // the projected real time and KEEP the old anchor, so we never adopt
            // the spoofed value; when the clock is corrected, drift falls back
            // within tolerance and we re-anchor normally.
            return ClockCheck(expectedWall, true, prev)
        }

        // Consistent — advance the anchor to now.
        return ClockCheck(wallMs, false, ClockAnchor(wallMs, elapsedMs))
    }
}
