package uk.co.cyberheroez.oroq.filter

import java.net.IDN

/**
 * Normalises a domain name so blocklist entries and queried names compare
 * equal: trims whitespace, lowercases, removes a trailing dot, and converts
 * internationalised names to ASCII (punycode). Returns "" for blank input.
 */
fun normalizeDomain(input: String): String {
    val trimmed = input.trim().lowercase().removeSuffix(".")
    if (trimmed.isEmpty()) return ""
    return try {
        IDN.toASCII(trimmed)
    } catch (e: IllegalArgumentException) {
        trimmed
    }
}
