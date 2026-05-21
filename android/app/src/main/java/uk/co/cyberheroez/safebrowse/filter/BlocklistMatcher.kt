package uk.co.cyberheroez.safebrowse.filter

/**
 * Returns true if [domain] (already normalised) is covered by [blocked] —
 * either an exact match or a subdomain of a blocked parent. With "evil.com"
 * in [blocked], "ads.evil.com" is blocked but "evil.com.uk" is not.
 */
fun isDomainBlocked(domain: String, blocked: Set<String>): Boolean {
    var current = domain
    while (current.isNotEmpty()) {
        if (current in blocked) return true
        val dot = current.indexOf('.')
        if (dot < 0) return false
        current = current.substring(dot + 1)
    }
    return false
}
