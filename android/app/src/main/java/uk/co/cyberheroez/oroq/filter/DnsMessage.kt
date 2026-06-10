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

    /** True when the query's first question is an A (IPv4) question. */
    fun isAQuery(bytes: ByteArray): Boolean {
        var i = HEADER_LEN
        while (i < bytes.size && bytes[i].toInt() != 0) i += (bytes[i].toInt() and 0xFF) + 1
        if (i + 2 >= bytes.size) return false
        return bytes[i + 1].toInt() == 0 && bytes[i + 2].toInt() == 1
    }

    /** Builds a response answering the query's question with a single A record. */
    fun buildARecordResponse(query: ByteArray, ipv4: ByteArray, ttlSeconds: Int = 300): ByteArray {
        require(ipv4.size == 4) { "A record needs a 4-byte IPv4 address" }
        // End of question section: header + QNAME + QTYPE(2) + QCLASS(2).
        var i = HEADER_LEN
        while (i < query.size && query[i].toInt() != 0) i += (query[i].toInt() and 0xFF) + 1
        val questionEnd = i + 5
        require(questionEnd <= query.size) { "query truncated before question end" }
        val out = java.io.ByteArrayOutputStream()
        out.write(query, 0, 2)                       // ID echoed
        out.write(0x80 or (query[2].toInt() and 0x01)) // QR=1, keep RD
        out.write(0x80)                              // RA=1, RCODE=0
        out.write(0); out.write(1)                   // QDCOUNT 1
        out.write(0); out.write(1)                   // ANCOUNT 1
        out.write(0); out.write(0)                   // NSCOUNT 0
        out.write(0); out.write(0)                   // ARCOUNT 0
        out.write(query, HEADER_LEN, questionEnd - HEADER_LEN) // question echoed
        out.write(0xC0); out.write(0x0C)             // NAME: pointer to offset 12
        out.write(0); out.write(1)                   // TYPE A
        out.write(0); out.write(1)                   // CLASS IN
        out.write(ttlSeconds ushr 24); out.write(ttlSeconds ushr 16)
        out.write(ttlSeconds ushr 8); out.write(ttlSeconds)
        out.write(0); out.write(4)                   // RDLENGTH 4
        out.write(ipv4, 0, 4)                        // RDATA
        return out.toByteArray()
    }
}
