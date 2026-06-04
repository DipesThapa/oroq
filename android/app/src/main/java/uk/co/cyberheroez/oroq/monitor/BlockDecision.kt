package uk.co.cyberheroez.oroq.monitor

/** What the monitor should do for the current foreground state. */
enum class BlockDecision { ALLOW, BLOCK_APP, TIME_UP }

/**
 * Pure decision. A blocked foreground app always wins; otherwise, if a daily
 * limit is set and today's usage has reached it (plus any granted extra), the
 * screen is timed out.
 */
fun decideBlock(
    foregroundApp: String?,
    todayMinutes: Int,
    blockedApps: Set<String>,
    limitMinutes: Int,
    extraMinutes: Int,
): BlockDecision {
    if (foregroundApp != null && foregroundApp in blockedApps) return BlockDecision.BLOCK_APP
    if (limitMinutes > 0 && todayMinutes >= limitMinutes + extraMinutes) return BlockDecision.TIME_UP
    return BlockDecision.ALLOW
}

/** Parent-granted extra minutes only count on the day they were granted. */
fun effectiveExtraMinutes(extraMinutes: Int, extraDate: String, today: String): Int =
    if (extraDate == today) extraMinutes else 0

/**
 * New `extraMinutes` value after granting [grant] more minutes, given the
 * child's current screen-time and limit. Guarantees [grant] minutes of
 * additional headroom from now — even if the child is already past the limit
 * (a naive add would be entirely eaten by the existing overage).
 */
fun newExtraAfterGrant(
    currentExtra: Int,
    todayMinutes: Int,
    limitMinutes: Int,
    grant: Int,
): Int = maxOf(currentExtra, todayMinutes - limitMinutes) + grant
