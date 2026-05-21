package uk.co.cyberheroez.safebrowse.filter

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BlocklistMatcherTest {

    private val blocked = setOf("evil.com", "ads.tracker.net")

    @Test fun exactMatchIsBlocked() {
        assertTrue(isDomainBlocked("evil.com", blocked))
    }

    @Test fun subdomainOfBlockedParentIsBlocked() {
        assertTrue(isDomainBlocked("img.cdn.evil.com", blocked))
    }

    @Test fun unrelatedDomainIsAllowed() {
        assertFalse(isDomainBlocked("good.com", blocked))
    }

    @Test fun parentOfBlockedSubdomainIsAllowed() {
        // "ads.tracker.net" is blocked, but "tracker.net" itself is not
        assertFalse(isDomainBlocked("tracker.net", blocked))
    }

    @Test fun siblingOfBlockedSubdomainIsAllowed() {
        assertFalse(isDomainBlocked("news.tracker.net", blocked))
    }
}
