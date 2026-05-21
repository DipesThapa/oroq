package uk.co.cyberheroez.safebrowse.filter

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
