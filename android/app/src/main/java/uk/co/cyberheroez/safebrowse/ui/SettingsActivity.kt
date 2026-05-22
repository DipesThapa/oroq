package uk.co.cyberheroez.safebrowse.ui

import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.safebrowse.config.Categories
import uk.co.cyberheroez.safebrowse.config.ConfigRepository

/** PIN-locked settings: category toggles and change-PIN. */
class SettingsActivity : AppCompatActivity() {

    private val config by lazy { ConfigRepository(this) }
    private val categoryBoxes = mutableMapOf<String, CheckBox>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Gate entry behind the PIN before showing anything.
        showPinPrompt(
            context = this,
            title = "Enter parent PIN",
            onEntered = { pin -> checkPinThenOpen(pin) },
            onCancelled = { finish() },
            onForgot = { showRecoveryFlow() },
        )
    }

    /** Forgot-PIN path: verify the recovery code, then set a new PIN. */
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

    private fun buildLayout(enabled: Set<String>): ScrollView {
        val pad = (24 * resources.displayMetrics.density).toInt()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }
        column.addView(TextView(this).apply {
            text = "Settings"
            textSize = 24f
            gravity = Gravity.CENTER
        })

        column.addView(TextView(this).apply {
            text = "Blocked categories"
            textSize = 16f
            setPadding(0, pad, 0, 0)
        })
        for (category in Categories.SELECTABLE) {
            val box = CheckBox(this).apply {
                text = category.label
                isChecked = category.id in enabled
            }
            categoryBoxes[category.id] = box
            column.addView(box)
        }

        column.addView(Button(this).apply {
            text = "Save categories"
            setOnClickListener { saveCategories() }
        })
        column.addView(Button(this).apply {
            text = "Change PIN"
            setOnClickListener { changePin() }
        })

        return ScrollView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            addView(column)
        }
    }

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
