package uk.co.cyberheroez.oroq.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test
import uk.co.cyberheroez.oroq.family.FamilySummary
import uk.co.cyberheroez.oroq.parent.ChildSnapshot
import uk.co.cyberheroez.oroq.parent.Insights
import uk.co.cyberheroez.oroq.parent.ParentUiState
import uk.co.cyberheroez.oroq.parent.screens.HomeContent

class HomeEmptyTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun empty_shows_onboarding_not_gauge() {
        rule.setContent { HomeContent(ParentUiState(), {}, {}, {}, {}) }
        rule.onNodeWithText("Add your first device").assertIsDisplayed()
    }

    @Test
    fun populated_shows_gauge_not_onboarding() {
        val now = 1_700_000_000_000L
        val snap = ChildSnapshot(
            "p1", "Mia",
            FamilySummary(ts = now, protectionOn = true, screenTimeTodayMin = 0, dailyLimitMin = 0),
            now,
        )
        val state = ParentUiState(listOf(snap), Insights.derive(listOf(snap), now), false, now)
        rule.setContent { HomeContent(state, {}, {}, {}, {}) }
        rule.onNodeWithText("CYBER CONFIDENCE").assertIsDisplayed()
    }
}
