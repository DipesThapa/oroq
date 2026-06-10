package uk.co.cyberheroez.oroq.ui

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test
import uk.co.cyberheroez.oroq.ui.components.ConfidenceGauge

class GaugeTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun gauge_shows_score_and_threshold_word() {
        rule.setContent { ConfidenceGauge(score = 91) }
        rule.onNodeWithText("91/100").assertExists()
        rule.onNodeWithText("Excellent").assertExists()
    }

    @Test
    fun gauge_at_risk_below_sixty() {
        rule.setContent { ConfidenceGauge(score = 42) }
        rule.onNodeWithText("At risk").assertExists()
    }
}
