package uk.co.cyberheroez.oroq.parent

import uk.co.cyberheroez.oroq.family.FamilySummary

/** One paired child's latest summary plus when the parent fetched it. */
data class ChildSnapshot(
    val pairingId: String,
    val label: String,
    val summary: FamilySummary?,
    val fetchedAt: Long,
)

/** Derived dashboard stats (deck panel 06). All windows are 7 days. */
data class FamilyStats(
    val threatsBlockedWeek: Int,
    val unsafeDomainsWeek: Int,
    val devicesProtected: Int,
    val deviceCount: Int,
    val uptimePercent: Int,
    val score: Int,
)

/**
 * Confidence score 0–100 (deck §4): weighted sum of protections enabled,
 * device coverage, sync freshness, and threat handling. Weights are product
 * constants; the formula moves server-side in sub-project 3.
 */
object ConfidenceScore {
    const val W_PROTECTION = 40
    const val W_COVERAGE = 25
    const val W_FRESHNESS = 20
    const val W_THREATS = 15
    const val FRESH_MS = 24 * 3_600_000L

    fun compute(snapshots: List<ChildSnapshot>, now: Long): Int {
        if (snapshots.isEmpty()) return 0
        val n = snapshots.size.toDouble()
        val protectionFrac = snapshots.count { it.summary?.protectionOn == true } / n
        val freshFrac = snapshots.count { now - it.fetchedAt < FRESH_MS } / n
        val coveredFrac = snapshots.count { it.summary != null } / n
        // Threat handling: full credit unless we have no signal at all.
        val threatFrac = if (snapshots.any { it.summary != null }) 1.0 else 0.0
        return (W_PROTECTION * protectionFrac + W_COVERAGE * coveredFrac +
            W_FRESHNESS * freshFrac + W_THREATS * threatFrac).toInt()
    }

    /** Deck thresholds: ≥80 Excellent (blue), 60–79 Fair (amber), <60 At risk (red). */
    fun statusWord(score: Int): String = when {
        score >= 80 -> "Excellent"
        score >= 60 -> "Fair"
        else -> "At risk"
    }
}

object Insights {
    private const val WEEK_MS = 7 * 24 * 3_600_000L

    /** Real blocklist ids that count as threats ("scam" kept for forward-compat). */
    private val THREAT_CATS = setOf("phishing", "malware", "scam", "adult")

    fun derive(snapshots: List<ChildSnapshot>, now: Long): FamilyStats {
        val weekEvents = snapshots.flatMap { it.summary?.recentEvents ?: emptyList() }
            .filter { now - it.ts < WEEK_MS }
        val threats = weekEvents.filter { it.type == "web" && it.cat in THREAT_CATS }
        val protectedCount = snapshots.count {
            it.summary?.protectionOn == true && now - it.fetchedAt < ConfidenceScore.FRESH_MS
        }
        val uptime = if (snapshots.isEmpty()) 0
        else (100.0 * protectedCount / snapshots.size).toInt()
        return FamilyStats(
            threatsBlockedWeek = threats.size,
            unsafeDomainsWeek = threats.map { it.label }.toSet().size,
            devicesProtected = protectedCount,
            deviceCount = snapshots.size,
            uptimePercent = uptime,
            score = ConfidenceScore.compute(snapshots, now),
        )
    }
}
