package uk.co.cyberheroez.oroq.filter

/**
 * DNS-level Safe Search / YouTube Restricted Mode, the mechanism Google
 * documents for networks: answer the search domain's A query with the
 * enforcement VIP instead of forwarding upstream. Certificates stay valid —
 * Google serves the real hostnames on these VIPs.
 */
object SafeSearchRewriter {
    /** forcesafesearch.google.com */
    val FORCE_SAFESEARCH_IP = byteArrayOf(216.toByte(), 239.toByte(), 38, 120)

    /** restrictmoderate.youtube.com */
    val RESTRICT_MODERATE_IP = byteArrayOf(216.toByte(), 239.toByte(), 38, 119)

    /** strict.bing.com */
    val BING_STRICT_IP = byteArrayOf(204.toByte(), 79, 197.toByte(), 220.toByte())

    private val YOUTUBE = setOf(
        "www.youtube.com", "m.youtube.com", "youtubei.googleapis.com",
        "youtube.googleapis.com", "www.youtube-nocookie.com",
    )

    /** Google web search hosts: `www.google.<tld>` (search), not other subdomains. */
    private fun isGoogleSearch(domain: String) =
        domain == "google.com" || (domain.startsWith("www.google.") && domain.count { it == '.' } <= 3)

    fun rewriteIp(domain: String, safeSearch: Boolean, ytRestricted: Boolean): ByteArray? {
        val d = domain.lowercase().trimEnd('.')
        if (ytRestricted && d in YOUTUBE) return RESTRICT_MODERATE_IP
        if (safeSearch && isGoogleSearch(d)) return FORCE_SAFESEARCH_IP
        if (safeSearch && d == "www.bing.com") return BING_STRICT_IP
        return null
    }
}
