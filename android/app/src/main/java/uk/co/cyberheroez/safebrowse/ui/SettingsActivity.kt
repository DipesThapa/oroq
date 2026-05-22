package uk.co.cyberheroez.safebrowse.ui

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.safebrowse.config.Categories
import uk.co.cyberheroez.safebrowse.config.ConfigRepository
import uk.co.cyberheroez.safebrowse.ui.Style.body
import uk.co.cyberheroez.safebrowse.ui.Style.card
import uk.co.cyberheroez.safebrowse.ui.Style.cardTitle
import uk.co.cyberheroez.safebrowse.ui.Style.dp
import uk.co.cyberheroez.safebrowse.ui.Style.ghostButton
import uk.co.cyberheroez.safebrowse.ui.Style.primaryButton
import uk.co.cyberheroez.safebrowse.ui.Style.screen

/** PIN-locked settings: category toggles, change-PIN, and reliability guidance. */
class SettingsActivity : AppCompatActivity() {

    private val config by lazy { ConfigRepository(this) }
    private val categoryBoxes = mutableMapOf<String, CheckBox>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "Settings"
        showPinPrompt(
            context = this,
            title = "Enter parent PIN",
            onEntered = { pin -> checkPinThenOpen(pin) },
            onCancelled = { finish() },
            onForgot = { showRecoveryFlow() },
        )
    }

    private fun showRecoveryFlow() {
        val input = EditText(this).apply { hint = "Recovery code" }
        AlertDialog.Builder(this)
            .setTitle("Enter recovery code")
            .setView(input)
            .setCancelable(false)
            .setPositiveButton("OK") { _, _ ->
                lifecycleScope.launch {
                    if (config.verifyRecoveryCode(input.text.toString())) {
                        promptNewPinViaRecovery()
                    } else {
                        Toast.makeText(this@SettingsActivity, "Wrong recovery code", Toast.LENGTH_SHORT).show()
                        finish()
                    }
                }
            }
            .setNegativeButton("Cancel") { _, _ -> finish() }
            .show()
    }

    private fun promptNewPinViaRecovery() {
        showPinPrompt(
            context = this,
            title = "Set a new PIN (4+ digits)",
            onEntered = { newPin ->
                if (newPin.length < 4) {
                    Toast.makeText(this, "PIN must be at least 4 digits", Toast.LENGTH_SHORT).show()
                    finish()
                } else {
                    lifecycleScope.launch {
                        config.setPin(newPin)
                        Toast.makeText(this@SettingsActivity, "PIN reset", Toast.LENGTH_SHORT).show()
                        setContentView(buildLayout(config.getEnabledCategories()))
                    }
                }
            },
            onCancelled = { finish() },
        )
    }

    private fun checkPinThenOpen(pin: String) {
        lifecycleScope.launch {
            if (config.verifyPin(pin)) {
                setContentView(buildLayout(config.getEnabledCategories()))
            } else {
                Toast.makeText(this@SettingsActivity, "Wrong PIN", Toast.LENGTH_SHORT).show()
                finish()
            }
        }
    }

    private fun buildLayout(enabled: Set<String>): View = screen(this) {
        card {
            cardTitle("Blocked categories")
            for (category in Categories.SELECTABLE) {
                val box = CheckBox(context).apply {
                    text = category.label
                    textSize = 15f
                    isChecked = category.id in enabled
                }
                categoryBoxes[category.id] = box
                addView(box, gap(2))
            }
        }
        card {
            cardTitle("Reliability")
            body("Keep protection always on and exempt SafeBrowse from battery limits.")
            ghostButton("Battery settings") {
                runCatching { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
            }
            ghostButton("VPN settings") {
                runCatching { startActivity(Intent(Settings.ACTION_VPN_SETTINGS)) }
            }
        }
        primaryButton("Save categories") { saveCategories() }
        ghostButton("Change PIN") { changePin() }
    }

    private fun LinearLayout.gap(topDp: Int) = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(topDp) }

    private fun saveCategories() {
        val categories = categoryBoxes.filterValues { it.isChecked }.keys.toSet()
        if (categories.isEmpty()) {
            Toast.makeText(this, "Choose at least one category", Toast.LENGTH_SHORT).show()
            return
        }
        lifecycleScope.launch {
            config.setEnabledCategories(categories)
            Toast.makeText(
                this@SettingsActivity,
                "Saved. Restart protection for changes to take effect.",
                Toast.LENGTH_LONG,
            ).show()
        }
    }

    private fun changePin() {
        showPinPrompt(
            context = this,
            title = "New parent PIN (4+ digits)",
            onEntered = { newPin ->
                if (newPin.length < 4) {
                    Toast.makeText(this, "PIN must be at least 4 digits", Toast.LENGTH_SHORT).show()
                } else {
                    lifecycleScope.launch {
                        config.setPin(newPin)
                        Toast.makeText(this@SettingsActivity, "PIN changed", Toast.LENGTH_SHORT).show()
                    }
                }
            },
        )
    }
}
