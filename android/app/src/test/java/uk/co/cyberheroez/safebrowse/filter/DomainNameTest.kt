package uk.co.cyberheroez.safebrowse.filter

import org.junit.Assert.assertEquals
import org.junit.Test

class DomainNameTest {

    @Test fun lowercasesAndTrims() {
        assertEquals("evil.com", normalizeDomain("  Evil.COM  "))
    }

    @Test fun stripsTrailingDot() {
        assertEquals("evil.com", normalizeDomain("evil.com."))
    }

    @Test fun convertsInternationalisedNamesToAscii() {
        assertEquals("xn--bcher-kva.de", normalizeDomain("BÜCHER.de"))
    }

    @Test fun emptyInputStaysEmpty() {
        assertEquals("", normalizeDomain("   "))
    }
}
