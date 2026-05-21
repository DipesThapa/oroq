package uk.co.cyberheroez.safebrowse.vpn

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
