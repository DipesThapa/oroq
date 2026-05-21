package uk.co.cyberheroez.safebrowse.vpn

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Ipv4PacketTest {

    /** A 20-byte IPv4 header: UDP protocol, src 10.0.0.1, dst 10.0.0.2. */
    private val header = byteArrayOf(
        0x45, 0x00,             // version 4, IHL 5
        0x00, 0x1C,             // total length = 28
        0x00, 0x00, 0x00, 0x00, // id, flags, fragment
        0x40, 0x11,             // TTL 64, protocol 17 (UDP)
        0x00, 0x00,             // header checksum
        0x0A, 0x00, 0x00, 0x01, // src 10.0.0.1
        0x0A, 0x00, 0x00, 0x02, // dst 10.0.0.2
    )

    @Test fun recognisesIpv4() {
        assertTrue(Ipv4Packet.isIpv4(header))
        assertFalse(Ipv4Packet.isIpv4(byteArrayOf(0x60, 0, 0, 0)))
        assertFalse(Ipv4Packet.isIpv4(byteArrayOf(0x45)))
    }

    @Test fun readsProtocolAndHeaderLength() {
        assertEquals(Ipv4Packet.PROTOCOL_UDP, Ipv4Packet.protocol(header))
        assertEquals(20, Ipv4Packet.headerLength(header))
    }

    @Test fun readsAddresses() {
        assertArrayEquals(byteArrayOf(10, 0, 0, 1), Ipv4Packet.sourceAddress(header))
        assertArrayEquals(byteArrayOf(10, 0, 0, 2), Ipv4Packet.destinationAddress(header))
    }
}
