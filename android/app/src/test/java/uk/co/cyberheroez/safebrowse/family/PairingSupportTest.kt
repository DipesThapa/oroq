package uk.co.cyberheroez.safebrowse.family

import org.junit.Assert.assertEquals
import org.junit.Test

class PairingSupportTest {

    @Test fun uppercasesAndTrims() {
        assertEquals("ABCD2345", normalizeCode("  abcd2345 "))
    }

    @Test fun stripsSpacesAndHyphens() {
        assertEquals("ABCD2345", normalizeCode("abcd-2345"))
        assertEquals("ABCD2345", normalizeCode("ABCD 2345"))
    }

    @Test fun leavesAValidCodeUnchanged() {
        assertEquals("WXYZ6789", normalizeCode("WXYZ6789"))
    }
}
