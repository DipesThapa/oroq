package uk.co.cyberheroez.safebrowse.filter

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BlocklistRepositoryTest {

    private val repo = BlocklistRepository(
        mapOf(
            "adult" to setOf("pornhub.com"),
            "gambling" to setOf("bet365.com"),
        )
    )

    @Test fun blockedWhenItsCategoryIsEnabled() {
        assertTrue(repo.isBlocked("www.pornhub.com", setOf("adult")))
    }

    @Test fun allowedWhenItsCategoryIsDisabled() {
        assertFalse(repo.isBlocked("www.pornhub.com", setOf("gambling")))
    }

    @Test fun unknownCategoryNameIsIgnored() {
        assertFalse(repo.isBlocked("pornhub.com", setOf("nonexistent")))
    }

    @Test fun normalisesTheQueryBeforeMatching() {
        assertTrue(repo.isBlocked("  PORNHUB.COM.  ", setOf("adult")))
    }

    @Test fun availableCategoriesListsAllKeys() {
        assertTrue(repo.availableCategories.containsAll(setOf("adult", "gambling")))
    }
}
