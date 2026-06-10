package uk.co.cyberheroez.oroq.filter

/**
 * Decides whether a DNS query should be blocked. [enabledCategories] is a
 * supplier so the running service can change categories without rebuilding
 * the filter.
 */
class DnsFilter(
    private val repository: BlocklistRepository,
    private val enabledCategories: () -> Set<String>,
    private val safeSearchOn: () -> Boolean = { false },
    private val ytRestrictedOn: () -> Boolean = { false },
) {
    sealed interface Decision {
        /** Block the query; [response] is the NXDOMAIN answer to return and
         *  [category] which blocklist matched. */
        class Block(val response: ByteArray, val category: String?) : Decision
        /** Answer locally with [response] (Safe-Search rewrite) — not a block. */
        class Rewrite(val response: ByteArray) : Decision
        /** Allow the query; the caller should forward it upstream. */
        data object Allow : Decision
    }

    /** Returns [Decision.Allow] for any query that cannot be parsed. */
    fun decide(dnsQuery: ByteArray): Decision {
        val domain = DnsMessage.parseQuestionDomain(dnsQuery) ?: return Decision.Allow
        val ip = SafeSearchRewriter.rewriteIp(domain, safeSearchOn(), ytRestrictedOn())
        if (ip != null) {
            // A queries get the enforcement VIP; AAAA gets NXDOMAIN so clients
            // fall back to the rewritten A answer.
            return if (DnsMessage.isAQuery(dnsQuery)) {
                Decision.Rewrite(DnsMessage.buildARecordResponse(dnsQuery, ip))
            } else {
                Decision.Rewrite(DnsMessage.buildNxdomainResponse(dnsQuery))
            }
        }
        val category = repository.blockedCategory(domain, enabledCategories())
        return if (category != null) {
            Decision.Block(DnsMessage.buildNxdomainResponse(dnsQuery), category)
        } else {
            Decision.Allow
        }
    }
}
