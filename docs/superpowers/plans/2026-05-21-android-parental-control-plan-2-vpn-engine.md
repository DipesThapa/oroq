# Android Parental Control — Plan 2: VpnService Filter Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Plan 1's filtering core into a working on-device DNS filter — a `VpnService` that intercepts the device's DNS queries, blocks domains in the enabled categories, forwards the rest to a real resolver, and runs as a foreground service.

**Architecture:** A local-only `VpnService` advertises itself as the system DNS server and routes *only* DNS traffic into a TUN interface. A worker thread reads each IP packet, parses the IPv4/UDP/DNS layers, and either returns an NXDOMAIN response (blocked) or relays the query to an upstream resolver over a `protect()`-ed socket (allowed). All packet parsing and construction is pure, JVM-testable logic kept separate from the Android service so it can be unit-tested without an emulator.

**Tech Stack:** Kotlin, `android.net.VpnService`, foreground service + notification, JUnit 4.

**Reference:** Design spec — `docs/superpowers/specs/2026-05-21-oroq-android-parental-control-design.md` (§5).

**Depends on:** Plan 1 — uses `normalizeDomain`, `isDomainBlocked`, `BlocklistRepository`, `DnsMessage`, and the bundled `assets/blocklists/*.txt`.

**Plan series:** Plan 1 (done) → Plan 2 (this) → Plan 3 (parent UI + config + PIN) → Plan 4 (blocklist updates).

---

## File structure produced by this plan

```
android/app/src/main/
├─ AndroidManifest.xml                   + VPN service, permissions
├─ assets/blocklists/doh-endpoints.txt   known DoH hostnames (Task 6)
└─ java/uk/co/cyberheroez/oroq/
   ├─ filter/
   │  ├─ BlocklistAssets.kt              parseBlocklistText() + asset loader
   │  └─ DnsFilter.kt                    block/allow decision
   ├─ vpn/
   │  ├─ Ipv4Packet.kt                   IPv4 field accessors
   │  ├─ UdpPacket.kt                    parseUdp() + buildUdpPacket()
   │  └─ OroQVpnService.kt         the VpnService + foreground notif
   └─ MainActivity.kt                    + start/stop trigger (Task 8)
android/blocklist/sources/doh.json       DoH endpoint source (Task 6)

android/app/src/test/java/uk/co/cyberheroez/oroq/
├─ filter/BlocklistAssetsTest.kt
├─ filter/DnsFilterTest.kt
└─ vpn/
   ├─ Ipv4PacketTest.kt
   └─ UdpPacketTest.kt
```

---

## Task 1: Blocklist asset loader

Parses a bundled `.txt` blocklist (pure, tested) and loads all categories from
the APK assets into a `BlocklistRepository` (Android, verified later on device).

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/filter/BlocklistAssets.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/oroq/filter/BlocklistAssetsTest.kt`

- [ ] **Step 1: Write the failing test**

Create `BlocklistAssetsTest.kt`:

```kotlin
package uk.co.cyberheroez.oroq.filter

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BlocklistAssetsTest {

    @Test fun parsesOneDomainPerLine() {
        val result = parseBlocklistText("evil.com\nbad.net\n")
        assertEquals(setOf("evil.com", "bad.net"), result)
    }

    @Test fun trimsBlankLinesAndWhitespace() {
        val result = parseBlocklistText("  evil.com  \n\n   \nbad.net\n")
        assertEquals(setOf("evil.com", "bad.net"), result)
    }

    @Test fun ignoresCommentLines() {
        val result = parseBlocklistText("# a comment\nevil.com\n")
        assertEquals(setOf("evil.com"), result)
    }

    @Test fun emptyTextYieldsEmptySet() {
        assertTrue(parseBlocklistText("").isEmpty())
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "*BlocklistAssetsTest"
```

Expected: FAIL — `parseBlocklistText` is unresolved.

- [ ] **Step 3: Write the implementation**

Create `BlocklistAssets.kt`:

```kotlin
package uk.co.cyberheroez.oroq.filter

import android.content.res.AssetManager

/**
 * Parses the text of a bundled blocklist file into a set of domains.
 * One domain per line; blank lines and `#` comment lines are ignored.
 */
fun parseBlocklistText(text: String): Set<String> =
    text.lineSequence()
        .map { it.trim() }
        .filter { it.isNotEmpty() && !it.startsWith("#") }
        .toSet()

/**
 * Loads every `blocklists/<category>.txt` asset bundled in the APK into a
 * [BlocklistRepository]. The category name is the file name without `.txt`.
 */
fun loadBlocklistRepository(assets: AssetManager): BlocklistRepository {
    val dir = "blocklists"
    val categories = HashMap<String, Set<String>>()
    for (name in assets.list(dir).orEmpty()) {
        if (!name.endsWith(".txt")) continue
        val category = name.removeSuffix(".txt")
        val text = assets.open("$dir/$name").bufferedReader().use { it.readText() }
        categories[category] = parseBlocklistText(text)
    }
    return BlocklistRepository(categories)
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
./gradlew :app:testDebugUnitTest --tests "*BlocklistAssetsTest"
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
cd ..
git add android/app/src/main/java android/app/src/test/java
git commit -m "feat(android): blocklist asset loader"
```

---

## Task 2: IPv4 packet field accessors

Read-only accessors for the IPv4 header fields the VPN loop needs.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/vpn/Ipv4Packet.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/oroq/vpn/Ipv4PacketTest.kt`

- [ ] **Step 1: Write the failing test**

Create `Ipv4PacketTest.kt`:

```kotlin
package uk.co.cyberheroez.oroq.vpn

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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "*Ipv4PacketTest"
```

Expected: FAIL — `Ipv4Packet` is unresolved.

- [ ] **Step 3: Write the implementation**

Create `Ipv4Packet.kt`:

```kotlin
package uk.co.cyberheroez.oroq.vpn

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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
./gradlew :app:testDebugUnitTest --tests "*Ipv4PacketTest"
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
cd ..
git add android/app/src/main/java android/app/src/test/java
git commit -m "feat(android): IPv4 packet field accessors"
```

---

## Task 3: UDP datagram parsing

Extracts the UDP layer — ports and payload — from an IPv4 packet.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/vpn/UdpPacket.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/oroq/vpn/UdpPacketTest.kt`

- [ ] **Step 1: Write the failing test**

Create `UdpPacketTest.kt`:

```kotlin
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
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "*UdpPacketTest"
```

Expected: FAIL — `parseUdp` and `UdpPacket` are unresolved.

- [ ] **Step 3: Write the implementation**

Create `UdpPacket.kt`:

```kotlin
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
./gradlew :app:testDebugUnitTest --tests "*UdpPacketTest"
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
cd ..
git add android/app/src/main/java android/app/src/test/java
git commit -m "feat(android): UDP datagram parsing"
```

---

## Task 4: UDP response packet builder

Builds a complete IPv4+UDP packet to write back into the TUN interface, with a
correct IPv4 header checksum. The UDP checksum is set to 0, which IPv4 permits
("checksum not computed") and avoids the UDP pseudo-header calculation.

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/vpn/UdpPacket.kt`
- Modify: `android/app/src/test/java/uk/co/cyberheroez/oroq/vpn/UdpPacketTest.kt`

- [ ] **Step 1: Add the failing tests**

Append these methods inside the `UdpPacketTest` class in `UdpPacketTest.kt`:

```kotlin
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "*UdpPacketTest"
```

Expected: FAIL — `buildUdpPacket` and `ones16Checksum` are unresolved.

- [ ] **Step 3: Add the implementation**

Append to `UdpPacket.kt` (after `parseUdp`):

```kotlin
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
./gradlew :app:testDebugUnitTest --tests "*UdpPacketTest"
```

Expected: PASS — 5 tests (3 from Task 3 + 2 new).

- [ ] **Step 5: Commit**

```bash
cd ..
git add android/app/src/main/java android/app/src/test/java
git commit -m "feat(android): UDP response packet builder"
```

---

## Task 5: DNS filter decision

Ties Plan 1's `DnsMessage` and `BlocklistRepository` together: given a raw DNS
query, decide whether to block it (and produce the NXDOMAIN response) or allow it.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/filter/DnsFilter.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/oroq/filter/DnsFilterTest.kt`

- [ ] **Step 1: Write the failing test**

Create `DnsFilterTest.kt`:

```kotlin
package uk.co.cyberheroez.oroq.filter

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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "*DnsFilterTest"
```

Expected: FAIL — `DnsFilter` is unresolved.

- [ ] **Step 3: Write the implementation**

Create `DnsFilter.kt`:

```kotlin
package uk.co.cyberheroez.oroq.filter

/**
 * Decides whether a DNS query should be blocked. [enabledCategories] is a
 * supplier so the running service can change categories without rebuilding
 * the filter.
 */
class DnsFilter(
    private val repository: BlocklistRepository,
    private val enabledCategories: () -> Set<String>,
) {
    sealed interface Decision {
        /** Block the query; [response] is the NXDOMAIN answer to return. */
        class Block(val response: ByteArray) : Decision
        /** Allow the query; the caller should forward it upstream. */
        data object Allow : Decision
    }

    /** Returns [Decision.Allow] for any query that cannot be parsed. */
    fun decide(dnsQuery: ByteArray): Decision {
        val domain = DnsMessage.parseQuestionDomain(dnsQuery) ?: return Decision.Allow
        return if (repository.isBlocked(domain, enabledCategories())) {
            Decision.Block(DnsMessage.buildNxdomainResponse(dnsQuery))
        } else {
            Decision.Allow
        }
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
./gradlew :app:testDebugUnitTest --tests "*DnsFilterTest"
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
cd ..
git add android/app/src/main/java android/app/src/test/java
git commit -m "feat(android): DNS filter block/allow decision"
```

---

## Task 6: DoH-endpoint category

Browsers that use their own DNS-over-HTTPS would bypass DNS filtering. Adding the
known DoH hostnames as a blocklist category — always enabled by the service —
forces those browsers to fall back to the system resolver, which the VPN controls.

**Files:**
- Create: `android/blocklist/sources/doh.json`
- Regenerate: `android/app/src/main/assets/blocklists/doh.txt` (+ `manifest.json`)

- [ ] **Step 1: Create the DoH endpoint source**

Create `android/blocklist/sources/doh.json`:

```json
{
  "category": "doh",
  "description": "Public DNS-over-HTTPS endpoints, blocked so browsers fall back to system DNS",
  "domains": [
    "cloudflare-dns.com",
    "mozilla.cloudflare-dns.com",
    "dns.google",
    "dns.google.com",
    "dns.quad9.net",
    "doh.opendns.com",
    "dns.adguard.com",
    "dns.adguard-dns.com",
    "doh.cleanbrowsing.org",
    "dns.nextdns.io",
    "chrome.cloudflare-dns.com",
    "dns11.quad9.net"
  ]
}
```

- [ ] **Step 2: Rebuild the bundled blocklist assets**

```bash
node android/blocklist/build-blocklist.mjs
```

Expected: nine `built <category>: ...` lines, now including
`built doh: 12 domains (version ...)`.

- [ ] **Step 3: Verify the asset was generated**

```bash
cat android/app/src/main/assets/blocklists/doh.txt
```

Expected: the 12 DoH hostnames, one per line, sorted.

- [ ] **Step 4: Commit**

```bash
git add android/blocklist/sources/doh.json android/app/src/main/assets/blocklists
git commit -m "feat(android): DoH-endpoint blocklist category"
```

> The `doh` category is loaded like any other by `loadBlocklistRepository`. The
> VpnService (Task 7) always includes `"doh"` in its enabled categories.

---

## Task 7: The VpnService

The `VpnService` that establishes the TUN interface, runs the packet loop, and
runs as a foreground service. This is Android integration code — it is verified
on a device in Task 8, not by unit tests.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/vpn/OroQVpnService.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Declare the service and permissions in the manifest**

In `android/app/src/main/AndroidManifest.xml`, add these `<uses-permission>`
elements as children of `<manifest>`, immediately before the `<application>` tag:

```xml
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

Then add this `<service>` element as a child of `<application>`, immediately
before the closing `</application>` tag:

```xml
        <service
            android:name=".vpn.OroQVpnService"
            android:exported="false"
            android:permission="android.permission.BIND_VPN_SERVICE"
            android:foregroundServiceType="specialUse">
            <intent-filter>
                <action android:name="android.net.VpnService" />
            </intent-filter>
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="On-device parental DNS filtering" />
        </service>
```

- [ ] **Step 2: Write the VpnService**

Create `OroQVpnService.kt`:

```kotlin
package uk.co.cyberheroez.oroq.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor
import uk.co.cyberheroez.oroq.MainActivity
import uk.co.cyberheroez.oroq.R
import uk.co.cyberheroez.oroq.filter.DnsFilter
import uk.co.cyberheroez.oroq.filter.loadBlocklistRepository
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.concurrent.atomic.AtomicBoolean

/**
 * A local-only VpnService that intercepts DNS traffic. It advertises itself as
 * the system DNS server and routes only that server's address into the TUN, so
 * the worker loop sees DNS packets exclusively.
 */
class OroQVpnService : VpnService() {

    private val running = AtomicBoolean(false)
    private var tun: ParcelFileDescriptor? = null
    private var worker: Thread? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopVpn()
            return START_NOT_STICKY
        }
        startVpn()
        return START_STICKY
    }

    private fun startVpn() {
        if (running.get()) return
        startForeground(NOTIFICATION_ID, buildNotification())
        val descriptor = Builder()
            .setSession("OroQ")
            .addAddress(VPN_ADDRESS, 32)
            .addDnsServer(DNS_SERVER)
            .addRoute(DNS_SERVER, 32)
            .establish()
        if (descriptor == null) {
            stopVpn()
            return
        }
        tun = descriptor
        running.set(true)
        worker = Thread { runLoop(descriptor) }.also { it.start() }
    }

    private fun runLoop(descriptor: ParcelFileDescriptor) {
        val repository = loadBlocklistRepository(assets)
        // Plan 2: every category is enabled. Plan 3 replaces this with the
        // parent's saved configuration. "doh" is always among the categories.
        val filter = DnsFilter(repository) { repository.availableCategories }
        val input = FileInputStream(descriptor.fileDescriptor)
        val output = FileOutputStream(descriptor.fileDescriptor)
        val buffer = ByteArray(MAX_PACKET)
        while (running.get()) {
            val length = try {
                input.read(buffer)
            } catch (e: Exception) {
                break
            }
            if (length <= 0) continue
            val udp = parseUdp(buffer.copyOf(length)) ?: continue
            if (udp.destinationPort != DNS_PORT) continue
            val responsePayload = when (val decision = filter.decide(udp.payload)) {
                is DnsFilter.Decision.Block -> decision.response
                DnsFilter.Decision.Allow -> resolveUpstream(udp.payload) ?: continue
            }
            val reply = buildUdpPacket(
                sourceAddress = udp.destinationAddress,
                destinationAddress = udp.sourceAddress,
                sourcePort = udp.destinationPort,
                destinationPort = udp.sourcePort,
                payload = responsePayload,
            )
            try {
                output.write(reply)
            } catch (e: Exception) {
                break
            }
        }
    }

    /** Forwards [query] to the upstream resolver over a protected socket. */
    private fun resolveUpstream(query: ByteArray): ByteArray? = try {
        DatagramSocket().use { socket ->
            protect(socket)
            socket.soTimeout = UPSTREAM_TIMEOUT_MS
            val server = InetAddress.getByName(UPSTREAM_DNS)
            socket.send(DatagramPacket(query, query.size, server, DNS_PORT))
            val buf = ByteArray(MAX_PACKET)
            val response = DatagramPacket(buf, buf.size)
            socket.receive(response)
            buf.copyOf(response.length)
        }
    } catch (e: Exception) {
        null
    }

    private fun stopVpn() {
        running.set(false)
        worker?.interrupt()
        worker = null
        try {
            tun?.close()
        } catch (e: Exception) {
            // already closed
        }
        tun = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        stopVpn()
        super.onDestroy()
    }

    private fun buildNotification(): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "OroQ protection",
                NotificationManager.IMPORTANCE_LOW,
            )
        )
        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("OroQ is protecting this device")
            .setContentText("Web filtering is active")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(openApp)
            .setOngoing(true)
            .build()
    }

    companion object {
        const val ACTION_STOP = "uk.co.cyberheroez.oroq.STOP_VPN"

        private const val VPN_ADDRESS = "10.111.222.1"
        private const val DNS_SERVER = "10.111.222.2"
        private const val UPSTREAM_DNS = "1.1.1.1"
        private const val DNS_PORT = 53
        private const val UPSTREAM_TIMEOUT_MS = 5000
        private const val MAX_PACKET = 32767
        private const val NOTIFICATION_ID = 1
        private const val CHANNEL_ID = "oroq_vpn"
    }
}
```

- [ ] **Step 3: Verify the project still compiles**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Commit**

```bash
cd ..
git add android/app/src/main/java android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): VpnService DNS filter engine"
```

---

## Task 8: Start/stop trigger and on-device verification

A minimal control to start and stop the VPN, plus the manual test that proves the
filter works. The real parent UI arrives in Plan 3.

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/MainActivity.kt`

- [ ] **Step 1: Replace MainActivity with a start/stop screen**

Replace the entire contents of `MainActivity.kt` with:

```kotlin
package uk.co.cyberheroez.oroq

import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.vpn.OroQVpnService

class MainActivity : ComponentActivity() {

    /** Launches the system VPN-consent dialog; starts the service if granted. */
    private val vpnConsent = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) startVpnService()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    ControlScreen(
                        onStart = ::requestVpn,
                        onStop = ::stopVpnService,
                    )
                }
            }
        }
    }

    private fun requestVpn() {
        val intent = VpnService.prepare(this)
        if (intent != null) {
            vpnConsent.launch(intent)
        } else {
            startVpnService()
        }
    }

    private fun startVpnService() {
        startService(Intent(this, OroQVpnService::class.java))
    }

    private fun stopVpnService() {
        startService(
            Intent(this, OroQVpnService::class.java)
                .setAction(OroQVpnService.ACTION_STOP)
        )
    }
}

@Composable
private fun ControlScreen(onStart: () -> Unit, onStop: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("OroQ", style = MaterialTheme.typography.headlineMedium)
        Button(onClick = onStart) { Text("Start protection") }
        Button(onClick = onStop) { Text("Stop protection") }
    }
}
```

- [ ] **Step 2: Build and run the full unit-test suite**

```bash
cd android && ./gradlew :app:testDebugUnitTest && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL` for both — all unit tests pass and the APK builds.

- [ ] **Step 3: Install and run on a device or emulator**

Start an emulator (or connect a device), then:

```bash
./gradlew :app:installDebug
```

Open the **OroQ** app. Tap **Start protection** — Android shows a VPN
consent dialog; accept it. A persistent "OroQ is protecting this device"
notification with the VPN key icon should appear.

- [ ] **Step 4: Manual filter verification**

With protection on, on the same device:

1. Open Chrome and visit `https://pornhub.com` (in the `adult` category).
   Expected: the page fails to load — the browser shows a connection error.
2. Visit `https://wikipedia.org`. Expected: loads normally.
3. Tap **Stop protection**, confirm the notification disappears, then revisit
   `https://pornhub.com`. Expected: it loads (filter is off).

If a blocked site still loads, check `adb logcat` while reproducing and confirm
the worker loop is reading packets. Stop and report rather than guessing.

- [ ] **Step 5: Commit**

```bash
cd ..
git add android/app/src/main/java
git commit -m "feat(android): VPN start/stop control and on-device verification"
```

---

## Done — Plan 2 outcome

A working on-device DNS filter: the `OroQVpnService` intercepts DNS,
blocks domains in the bundled categories (including `doh`), forwards the rest to
an upstream resolver, and runs as a foreground service. Packet parsing and
construction are fully unit-tested on the JVM. **Plan 3** adds the real parent
UI — onboarding, the five screens, PIN lock, and per-category configuration that
replaces Plan 2's "all categories enabled" default.
