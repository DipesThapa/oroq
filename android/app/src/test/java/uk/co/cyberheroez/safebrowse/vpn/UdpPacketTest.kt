package uk.co.cyberheroez.safebrowse.vpn

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UdpPacketTest {

    /** An IPv4+UDP packet: 10.0.0.1:40000 -> 10.0.0.2:53, payload {0xAB,0xCD}. */
    private val packet = byteArrayOf(
        0x45, 0x00, 0x00, 0x1E,             // IPv4: version/IHL, total length 30
        0x00, 0x00, 0x00, 0x00,
        0x40, 0x11, 0x00, 0x00,             // TTL 64, protocol 17 (UDP)
        0x0A, 0x00, 0x00, 0x01,             // src 10.0.0.1
        0x0A, 0x00, 0x00, 0x02,             // dst 10.0.0.2
        0x9C.toByte(), 0x40,                // UDP src port 40000
        0x00, 0x35,                         // UDP dst port 53
        0x00, 0x0A,                         // UDP length 10
        0x00, 0x00,                         // UDP checksum
        0xAB.toByte(), 0xCD.toByte(),       // UDP payload
    )

    @Test fun parsesPortsAndPayload() {
        val udp = parseUdp(packet)!!
        assertEquals(40000, udp.sourcePort)
        assertEquals(53, udp.destinationPort)
        assertArrayEquals(byteArrayOf(0xAB.toByte(), 0xCD.toByte()), udp.payload)
        assertArrayEquals(byteArrayOf(10, 0, 0, 1), udp.sourceAddress)
        assertArrayEquals(byteArrayOf(10, 0, 0, 2), udp.destinationAddress)
    }

    @Test fun returnsNullForNonUdpPacket() {
        val tcp = packet.copyOf()
        tcp[9] = 6 // protocol = TCP
        assertNull(parseUdp(tcp))
    }

    @Test fun returnsNullForTruncatedPacket() {
        assertNull(parseUdp(byteArrayOf(0x45, 0x00)))
    }
}
