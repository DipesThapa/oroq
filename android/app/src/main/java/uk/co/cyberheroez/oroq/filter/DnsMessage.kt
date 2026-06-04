package uk.co.cyberheroez.oroq.filter

/** Parsing and construction of DNS wire-format messages (RFC 1035). */
object DnsMessage {

    private const val HEADER_LEN = 12

    /**
     * Extracts the queried domain from a DNS message's question section.
     * Returns the lowercase, dot-separated name without a trailing dot, or
     * null if the message is truncated or uses name compression (which is
     * not permitted in a question section per RFC 1035 §4.1.4).
     */
    fun parseQuestionDomain(bytes: ByteArray): String? {
        if (bytes.size < HEADER_LEN + 1) return null
        val labels = mutableListOf<String>()
        var offset = HEADER_LEN
        while (offset < bytes.size) {
            val len = bytes[offset].toInt() and 0xFF
            if (len == 0) {
                return if (labels.isEmpty()) null else labels.joinToString(".").lowercase()
            }
            if (len and 0xC0 != 0) return null // compression pointer not allowed here
            offset += 1
            if (offset + len > bytes.size) return null
            labels.add(String(bytes, offset, len, Charsets.US_ASCII))
            offset += len
        }
        return null // no terminator
    }

    /**
     * Builds an NXDOMAIN response for [query]: copies it, then sets QR=1 and
     * AA=1 (keeping the RD bit), sets RCODE=3, and zeroes the answer,
     * authority, and additional record counts.
     */
    fun buildNxdomainResponse(query: ByteArray): ByteArray {
        require(query.size >= HEADER_LEN) { "query shorter than DNS header" }
        val out = query.copyOf()
        val rd = query[2].toInt() and 0x01
        out[2] = (0x80 or 0x04 or rd).toByte() // QR | AA | RD
        out[3] = 0x03                          // RA=0, Z=0, RCODE=3 (NXDOMAIN)
        out[6] = 0; out[7] = 0                 // ANCOUNT
        out[8] = 0; out[9] = 0                 // NSCOUNT
        out[10] = 0; out[11] = 0               // ARCOUNT
        return out
    }
}
