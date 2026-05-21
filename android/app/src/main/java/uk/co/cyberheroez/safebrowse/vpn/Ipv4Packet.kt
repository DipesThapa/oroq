package uk.co.cyberheroez.safebrowse.vpn

/** Read-only accessors for IPv4 packet header fields (RFC 791). */
object Ipv4Packet {

    const val PROTOCOL_UDP = 17

    /** True if [packet] is long enough and has IP version 4 in its first nibble. */
    fun isIpv4(packet: ByteArray): Boolean =
        packet.size >= 20 && (packet[0].toInt() and 0xF0) == 0x40

    /** IP protocol number from header offset 9 (17 = UDP). */
    fun protocol(packet: ByteArray): Int = packet[9].toInt() and 0xFF

    /** Header length in bytes — the IHL nibble multiplied by 4. */
    fun headerLength(packet: ByteArray): Int = (packet[0].toInt() and 0x0F) * 4

    /** The 4-byte source address (header offset 12). */
    fun sourceAddress(packet: ByteArray): ByteArray = packet.copyOfRange(12, 16)

    /** The 4-byte destination address (header offset 16). */
    fun destinationAddress(packet: ByteArray): ByteArray = packet.copyOfRange(16, 20)
}
