package uk.co.cyberheroez.oroq.filter

/**
 * Holds the per-category blocked-domain sets and answers filtering questions.
 * Decoupled from Android: pass already-loaded category sets so it can be unit
 * tested on the JVM. The Android layer supplies an asset-backed map.
 */
class BlocklistRepository(
    private val categories: Map<String, Set<String>>,
) {
    /** All category names this repository knows about. */
    val availableCategories: Set<String> get() = categories.keys

    /**
     * Returns true if [rawDomain] is blocked by any of [enabledCategories].
     * The domain is normalised first; unknown category names are ignored.
     */
    fun isBlocked(rawDomain: String, enabledCategories: Set<String>): Boolean =
        blockedCategory(rawDomain, enabledCategories) != null

    /** The first enabled category whose list matches [rawDomain], or null. */
    fun blockedCategory(rawDomain: String, enabledCategories: Set<String>): String? {
        val domain = normalizeDomain(rawDomain)
        if (domain.isEmpty()) return null
        for (category in enabledCategories) {
            val set = categories[category] ?: continue
            if (isDomainBlocked(domain, set)) return category
        }
        return null
    }
}
