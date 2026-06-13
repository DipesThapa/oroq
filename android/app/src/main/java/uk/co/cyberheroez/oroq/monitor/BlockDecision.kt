package uk.co.cyberheroez.oroq.monitor

/** What the monitor should do for the current foreground state. */
enum class BlockDecision { ALLOW, BLOCK_APP, BLOCK_UNAPPROVED, BLOCK_SCHEDULE, TIME_UP }

/**
 * Pure decision. Precedence (first match wins):
 *   1. system-critical app            → ALLOW
 *   2. app not approved (default-deny) → BLOCK_UNAPPROVED   (only when [approvedApps] != null)
 *   3. approved app inside a blocked schedule window → BLOCK_SCHEDULE
 *   4. legacy binary blocklist        → BLOCK_APP
 *   5. device-wide daily limit reached → TIME_UP
 *   6. otherwise                      → ALLOW
 *
 * The per-app params are appended with defaults so legacy callers keep their
 * original behaviour: [approvedApps] = null disables the approval gate, and an
 * empty [schedules]/[systemCriticalApps] plus null [dayOfWeek] disable those rules.
 */
fun decideBlock(
    foregroundApp: String?,
    todayMinutes: Int,
    blockedApps: Set<String>,
    limitMinutes: Int,
    extraMinutes: Int,
    approvedApps: Set<String>? = null,
    schedules: Map<String, List<Window>> = emptyMap(),
    systemCriticalApps: Set<String> = emptySet(),
    nowMinuteOfDay: Int = 0,
    dayOfWeek: java.time.DayOfWeek? = null,
): BlockDecision {
    if (foregroundApp != null && foregroundApp in systemCriticalApps) return BlockDecision.ALLOW
    if (approvedApps != null && foregroundApp != null && foregroundApp !in approvedApps) {
        return BlockDecision.BLOCK_UNAPPROVED
    }
    if (foregroundApp != null && dayOfWeek != null) {
        val windows = schedules[foregroundApp]
        if (windows != null && isBlockedNow(windows, nowMinuteOfDay, dayOfWeek)) {
            return BlockDecision.BLOCK_SCHEDULE
        }
    }
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
