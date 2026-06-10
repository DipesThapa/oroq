package uk.co.cyberheroez.oroq.filter

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SafeSearchRewriterTest {
    @Test
    fun `google domains rewrite when safe search on`() {
        assertArrayEquals(
            SafeSearchRewriter.FORCE_SAFESEARCH_IP,
            SafeSearchRewriter.rewriteIp("www.google.com", safeSearch = true, ytRestricted = false),
        )
        assertArrayEquals(
            SafeSearchRewriter.FORCE_SAFESEARCH_IP,
            SafeSearchRewriter.rewriteIp("www.google.co.uk", safeSearch = true, ytRestricted = false),
        )
    }

    @Test
    fun `youtube domains rewrite when restricted on`() {
        assertArrayEquals(
            SafeSearchRewriter.RESTRICT_MODERATE_IP,
            SafeSearchRewriter.rewriteIp("www.youtube.com", safeSearch = false, ytRestricted = true),
        )
        assertArrayEquals(
            SafeSearchRewriter.RESTRICT_MODERATE_IP,
            SafeSearchRewriter.rewriteIp("m.youtube.com", safeSearch = false, ytRestricted = true),
        )
    }

    @Test
    fun `nothing rewrites when flags off or domain unrelated`() {
        assertNull(SafeSearchRewriter.rewriteIp("www.google.com", safeSearch = false, ytRestricted = false))
        assertNull(SafeSearchRewriter.rewriteIp("www.youtube.com", safeSearch = true, ytRestricted = false))
        assertNull(SafeSearchRewriter.rewriteIp("example.com", safeSearch = true, ytRestricted = true))
        assertNull(SafeSearchRewriter.rewriteIp("maps.google.com", safeSearch = true, ytRestricted = false))
    }
}
