package uk.co.cyberheroez.oroq.vpn

/** A parsed UDP datagram together with its IPv4 addressing. */
class UdpPacket(
    val sourceAddress: ByteArray,
    val destinationAddress: ByteArray,
    val sourcePort: Int,
    val destinationPort: Int,
    val payload: ByteArray,
)

/** UDP header is 8 bytes: src port, dst port, length, checksum. */
private const val UDP_HEADER_LEN = 8

/**
 * Parses [ipPacket] as IPv4+UDP. Returns null if it is not a well-formed IPv4
 * UDP packet (wrong version, non-UDP protocol, or truncated).
 */
fun parseUdp(ipPacket: ByteArray): UdpPacket? {
    if (!Ipv4Packet.isIpv4(ipPacket)) return null
    if (Ipv4Packet.protocol(ipPacket) != Ipv4Packet.PROTOCOL_UDP) return null
    val ihl = Ipv4Packet.headerLength(ipPacket)
    if (ipPacket.size < ihl + UDP_HEADER_LEN) return null
    val srcPort = ((ipPacket[ihl].toInt() and 0xFF) shl 8) or (ipPacket[ihl + 1].toInt() and 0xFF)
    val dstPort = ((ipPacket[ihl + 2].toInt() and 0xFF) shl 8) or (ipPacket[ihl + 3].toInt() and 0xFF)
    return UdpPacket(
        sourceAddress = Ipv4Packet.sourceAddress(ipPacket),
        destinationAddress = Ipv4Packet.destinationAddress(ipPacket),
        sourcePort = srcPort,
        destinationPort = dstPort,
        payload = ipPacket.copyOfRange(ihl + UDP_HEADER_LEN, ipPacket.size),
    )
}

/**
 * Builds an IPv4+UDP packet carrying [payload]. The IPv4 header checksum is
 * computed; the UDP checksum is left 0 (permitted by IPv4, meaning "not
 * computed") so no UDP pseudo-header sum is needed.
 */
fun buildUdpPacket(
    sourceAddress: ByteArray,
    destinationAddress: ByteArray,
    sourcePort: Int,
    destinationPort: Int,
    payload: ByteArray,
): ByteArray {
    val ihl = 20
    val udpLength = UDP_HEADER_LEN + payload.size
    val totalLength = ihl + udpLength
    val p = ByteArray(totalLength)

    // ---- IPv4 header ----
    p[0] = 0x45                                         // version 4, IHL 5
    p[2] = ((totalLength ushr 8) and 0xFF).toByte()
    p[3] = (totalLength and 0xFF).toByte()
    p[8] = 64                                           // TTL
    p[9] = Ipv4Packet.PROTOCOL_UDP.toByte()
    System.arraycopy(sourceAddress, 0, p, 12, 4)
    System.arraycopy(destinationAddress, 0, p, 16, 4)
    val checksum = ones16Checksum(p, 0, ihl)            // checksum field is still 0
    p[10] = ((checksum ushr 8) and 0xFF).toByte()
    p[11] = (checksum and 0xFF).toByte()

    // ---- UDP header ----
    p[ihl] = ((sourcePort ushr 8) and 0xFF).toByte()
    p[ihl + 1] = (sourcePort and 0xFF).toByte()
    p[ihl + 2] = ((destinationPort ushr 8) and 0xFF).toByte()
    p[ihl + 3] = (destinationPort and 0xFF).toByte()
    p[ihl + 4] = ((udpLength ushr 8) and 0xFF).toByte()
    p[ihl + 5] = (udpLength and 0xFF).toByte()
    // p[ihl+6], p[ihl+7] = UDP checksum, left 0
    System.arraycopy(payload, 0, p, ihl + UDP_HEADER_LEN, payload.size)
    return p
}

/**
 * 16-bit one's-complement checksum over [length] bytes of [data] from
 * [offset]. Summing a valid IPv4 header (checksum field included) returns 0.
 */
fun ones16Checksum(data: ByteArray, offset: Int, length: Int): Int {
    var sum = 0
    var i = offset
    while (i < offset + length - 1) {
        sum += ((data[i].toInt() and 0xFF) shl 8) or (data[i + 1].toInt() and 0xFF)
        i += 2
    }
    if (length % 2 == 1) sum += (data[offset + length - 1].toInt() and 0xFF) shl 8
    while (sum ushr 16 != 0) sum = (sum and 0xFFFF) + (sum ushr 16)
    return sum.inv() and 0xFFFF
}
