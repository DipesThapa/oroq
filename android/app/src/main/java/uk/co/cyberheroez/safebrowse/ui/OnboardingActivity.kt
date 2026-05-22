package uk.co.cyberheroez.safebrowse.ui

import android.content.Intent
import android.os.Bundle
import android.text.InputType
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
import uk.co.cyberheroez.safebrowse.MainActivity
import uk.co.cyberheroez.safebrowse.config.Categories
import uk.co.cyberheroez.safebrowse.config.ConfigRepository
import uk.co.cyberheroez.safebrowse.config.PinHasher

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

    private fun buildLayout(): ScrollView {
        val pad = (24 * resources.displayMetrics.density).toInt()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }
        column.addView(heading("Set up SafeBrowse"))

        column.addView(label("Create a parent PIN (4+ digits)"))
        pinField = pinInput()
        column.addView(pinField)

        column.addView(label("Confirm PIN"))
        confirmField = pinInput()
        column.addView(confirmField)

        column.addView(label("Choose what to block"))
        for (category in Categories.SELECTABLE) {
            val box = CheckBox(this).apply {
                text = category.label
                isChecked = category.id in Categories.DEFAULT_ENABLED
            }
            categoryBoxes[category.id] = box
            column.addView(box)
        }

        column.addView(Button(this).apply {
            text = "Finish setup"
            setOnClickListener { finishSetup() }
        })

        return ScrollView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            addView(column)
        }
    }

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

    private fun heading(text: String) = TextView(this).apply {
        this.text = text
        textSize = 24f
        gravity = Gravity.CENTER
    }

    private fun label(text: String) = TextView(this).apply {
        this.text = text
        textSize = 16f
        setPadding(0, (16 * resources.displayMetrics.density).toInt(), 0, 0)
    }

    private fun pinInput() = EditText(this).apply {
        inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
    }

    private fun toast(message: String) =
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
}
