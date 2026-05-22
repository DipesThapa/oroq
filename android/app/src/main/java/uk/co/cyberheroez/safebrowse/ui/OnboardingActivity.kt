package uk.co.cyberheroez.safebrowse.ui

import android.content.Intent
import android.os.Bundle
import android.text.InputType
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
import uk.co.cyberheroez.safebrowse.MainActivity
import uk.co.cyberheroez.safebrowse.config.Categories
import uk.co.cyberheroez.safebrowse.config.ConfigRepository
import uk.co.cyberheroez.safebrowse.config.PinHasher
import uk.co.cyberheroez.safebrowse.ui.Style.body
import uk.co.cyberheroez.safebrowse.ui.Style.card
import uk.co.cyberheroez.safebrowse.ui.Style.cardTitle
import uk.co.cyberheroez.safebrowse.ui.Style.dp
import uk.co.cyberheroez.safebrowse.ui.Style.heading
import uk.co.cyberheroez.safebrowse.ui.Style.primaryButton
import uk.co.cyberheroez.safebrowse.ui.Style.screen

/** First-launch setup: parent PIN, category choice, and recovery code. */
class OnboardingActivity : AppCompatActivity() {

    private val config by lazy { ConfigRepository(this) }
    private lateinit var pinField: EditText
    private lateinit var confirmField: EditText
    private val categoryBoxes = mutableMapOf<String, CheckBox>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildLayout())
    }

    private fun buildLayout(): View = screen(this) {
        heading("Set up SafeBrowse")
        body("Create a parent PIN, then choose what to block.")
        card {
            cardTitle("Parent PIN")
            body("Create PIN (4+ digits)", topGap = 14)
            pinField = pinInput()
            addView(pinField, gap(8))
            body("Confirm PIN", topGap = 14)
            confirmField = pinInput()
            addView(confirmField, gap(8))
        }
        card {
            cardTitle("What to block")
            for (category in Categories.SELECTABLE) {
                val box = CheckBox(context).apply {
                    text = category.label
                    textSize = 15f
                    isChecked = category.id in Categories.DEFAULT_ENABLED
                }
                categoryBoxes[category.id] = box
                addView(box, gap(2))
            }
        }
        primaryButton("Finish setup") { finishSetup() }
    }

    private fun pinInput(): EditText = EditText(this).apply {
        inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        textSize = 16f
    }

    private fun gap(topDp: Int) = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(topDp) }

    private fun finishSetup() {
        val pin = pinField.text.toString()
        val confirm = confirmField.text.toString()
        if (pin.length < 4) {
            toast("PIN must be at least 4 digits")
            return
        }
        if (pin != confirm) {
            toast("PINs do not match")
            return
        }
        val categories = categoryBoxes.filterValues { it.isChecked }.keys.toSet()
        if (categories.isEmpty()) {
            toast("Choose at least one category to block")
            return
        }
        val recoveryCode = PinHasher.newRecoveryCode()
        lifecycleScope.launch {
            config.completeOnboarding(pin, recoveryCode, categories)
            showRecoveryCode(recoveryCode)
        }
    }

    private fun showRecoveryCode(code: String) {
        AlertDialog.Builder(this)
            .setTitle("Save your recovery code")
            .setMessage(
                "If you forget your PIN, this code is the only way to reset it:\n\n" +
                    "$code\n\nWrite it down somewhere safe now."
            )
            .setCancelable(false)
            .setPositiveButton("I have saved it") { _, _ ->
                startActivity(Intent(this, MainActivity::class.java))
                finish()
            }
            .show()
    }

    private fun toast(message: String) =
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
}
