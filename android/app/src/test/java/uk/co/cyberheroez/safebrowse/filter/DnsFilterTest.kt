package uk.co.cyberheroez.safebrowse.filter

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DnsFilterTest {

    /** Builds a minimal DNS query (A record, IN class) for [domain]. */
    private fun query(domain: String): ByteArray {
        val header = byteArrayOf(
            0x12, 0x34, 0x01, 0x00,
            0x00, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
        )
        val qname = ArrayList<Byte>()
        for (label in domain.split(".")) {
            qname.add(label.length.toByte())
            qname.addAll(label.toByteArray(Charsets.US_ASCII).toList())
        }
        qname.add(0.toByte())
        return header + qname.toByteArray() + byteArrayOf(0x00, 0x01, 0x00, 0x01)
    }

    private val repo = BlocklistRepository(mapOf("adult" to setOf("pornhub.com")))

    @Test fun blocksADomainInAnEnabledCategory() {
        val filter = DnsFilter(repo) { setOf("adult") }
        val decision = filter.decide(query("pornhub.com"))
        assertTrue(decision is DnsFilter.Decision.Block)
    }

    @Test fun blockResponseIsAnNxdomainAnswer() {
        val filter = DnsFilter(repo) { setOf("adult") }
        val decision = filter.decide(query("pornhub.com")) as DnsFilter.Decision.Block
        assertEquals(0x03, decision.response[3].toInt() and 0x0F) // RCODE = NXDOMAIN
    }

    @Test fun allowsADomainNotInAnyEnabledCategory() {
        val filter = DnsFilter(repo) { setOf("adult") }
        assertEquals(DnsFilter.Decision.Allow, filter.decide(query("wikipedia.org")))
    }

    @Test fun allowsAnUnparseableQuery() {
        val filter = DnsFilter(repo) { setOf("adult") }
        assertEquals(DnsFilter.Decision.Allow, filter.decide(byteArrayOf(1, 2, 3)))
    }
}
