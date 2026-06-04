package uk.co.cyberheroez.oroq.update

import org.junit.Assert.assertEquals
import org.junit.Test

class BlocklistManifestTest {

    @Test fun parsesCategoryVersionLines() {
        val parsed = parseManifest("adult aaa111\ngambling bbb222\n")
        assertEquals(mapOf("adult" to "aaa111", "gambling" to "bbb222"), parsed)
    }

    @Test fun parseManifestIgnoresBlankAndMalformedLines() {
        val parsed = parseManifest("adult aaa111\n\nmalformed\n")
        assertEquals(mapOf("adult" to "aaa111"), parsed)
    }

    @Test fun planUpdateReturnsChangedAndNewCategories() {
        val local = mapOf("adult" to "v1", "gambling" to "v1")
        val remote = mapOf("adult" to "v2", "gambling" to "v1", "drugs" to "v1")
        assertEquals(setOf("adult", "drugs"), planUpdate(local, remote))
    }

    @Test fun planUpdateReturnsEmptyWhenEverythingMatches() {
        val same = mapOf("adult" to "v1")
        assertEquals(emptySet<String>(), planUpdate(same, same))
    }
}
