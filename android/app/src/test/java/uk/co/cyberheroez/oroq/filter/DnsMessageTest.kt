package uk.co.cyberheroez.oroq.filter

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DnsMessageTest {

    /** Builds a minimal DNS query (A record, IN class) for [domain]. */
    private fun query(domain: String): ByteArray {
        val header = byteArrayOf(
            0x12, 0x34,             // ID
            0x01, 0x00,             // flags: RD=1
            0x00, 0x01,             // QDCOUNT = 1
            0x00, 0x00,             // ANCOUNT
            0x00, 0x00,             // NSCOUNT
            0x00, 0x00,             // ARCOUNT
        )
        val qname = ArrayList<Byte>()
        for (label in domain.split(".")) {
            qname.add(label.length.toByte())
            qname.addAll(label.toByteArray(Charsets.US_ASCII).toList())
        }
        qname.add(0.toByte())
        val footer = byteArrayOf(0x00, 0x01, 0x00, 0x01) // QTYPE=A, QCLASS=IN
        return header + qname.toByteArray() + footer
    }

    @Test fun parsesTheQueriedDomain() {
        assertEquals("pornhub.com", DnsMessage.parseQuestionDomain(query("pornhub.com")))
    }

    @Test fun lowercasesTheParsedDomain() {
        assertEquals("evil.com", DnsMessage.parseQuestionDomain(query("EVIL.com")))
    }

    @Test fun returnsNullForTruncatedMessage() {
        assertNull(DnsMessage.parseQuestionDomain(byteArrayOf(0, 1, 2)))
    }

    @Test fun nxdomainResponsePreservesIdAndSetsResponseBits() {
        val q = query("pornhub.com")
        val r = DnsMessage.buildNxdomainResponse(q)
        assertEquals(q[0], r[0])                    // ID byte preserved
        assertEquals(q[1], r[1])
        assertEquals(0x80, r[2].toInt() and 0x80)   // QR bit set
        assertEquals(0x03, r[3].toInt() and 0x0F)   // RCODE = NXDOMAIN
    }
}
