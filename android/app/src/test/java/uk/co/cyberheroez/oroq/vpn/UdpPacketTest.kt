package uk.co.cyberheroez.oroq.vpn

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

    @Test fun buildsAParsablePacketThatRoundTrips() {
        val built = buildUdpPacket(
            sourceAddress = byteArrayOf(10, 0, 0, 2),
            destinationAddress = byteArrayOf(10, 0, 0, 1),
            sourcePort = 53,
            destinationPort = 40000,
            payload = byteArrayOf(0xAB.toByte(), 0xCD.toByte()),
        )
        val parsed = parseUdp(built)!!
        assertEquals(53, parsed.sourcePort)
        assertEquals(40000, parsed.destinationPort)
        assertArrayEquals(byteArrayOf(0xAB.toByte(), 0xCD.toByte()), parsed.payload)
        assertArrayEquals(byteArrayOf(10, 0, 0, 2), parsed.sourceAddress)
        assertArrayEquals(byteArrayOf(10, 0, 0, 1), parsed.destinationAddress)
    }

    @Test fun builtPacketHasAValidIpv4HeaderChecksum() {
        val built = buildUdpPacket(
            sourceAddress = byteArrayOf(10, 0, 0, 2),
            destinationAddress = byteArrayOf(10, 0, 0, 1),
            sourcePort = 53,
            destinationPort = 40000,
            payload = byteArrayOf(1, 2, 3),
        )
        // Summing a valid header (checksum field included) yields 0.
        assertEquals(0, ones16Checksum(built, 0, 20))
    }
}
