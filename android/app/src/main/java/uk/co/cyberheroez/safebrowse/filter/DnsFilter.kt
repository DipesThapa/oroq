package uk.co.cyberheroez.safebrowse.filter

/**
 * Decides whether a DNS query should be blocked. [enabledCategories] is a
 * supplier so the running service can change categories without rebuilding
 * the filter.
 */
class DnsFilter(
    private val repository: BlocklistRepository,
    private val enabledCategories: () -> Set<String>,
) {
    sealed interface Decision {
        /** Block the query; [response] is the NXDOMAIN answer to return. */
        class Block(val response: ByteArray) : Decision
        /** Allow the query; the caller should forward it upstream. */
        data object Allow : Decision
    }

    /** Returns [Decision.Allow] for any query that cannot be parsed. */
    fun decide(dnsQuery: ByteArray): Decision {
        val domain = DnsMessage.parseQuestionDomain(dnsQuery) ?: return Decision.Allow
        return if (repository.isBlocked(domain, enabledCategories())) {
            Decision.Block(DnsMessage.buildNxdomainResponse(dnsQuery))
        } else {
            Decision.Allow
        }
    }
}
