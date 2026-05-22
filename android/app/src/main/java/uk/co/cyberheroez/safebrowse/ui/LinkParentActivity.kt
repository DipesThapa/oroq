package uk.co.cyberheroez.safebrowse.ui

import android.graphics.Typeface
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.safebrowse.family.FamilyCrypto
import uk.co.cyberheroez.safebrowse.family.FamilyStore
import uk.co.cyberheroez.safebrowse.family.ParentLink
import uk.co.cyberheroez.safebrowse.family.familyApi
import uk.co.cyberheroez.safebrowse.family.normalizeCode
import uk.co.cyberheroez.safebrowse.ui.Style.body
import uk.co.cyberheroez.safebrowse.ui.Style.card
import uk.co.cyberheroez.safebrowse.ui.Style.cardTitle
import uk.co.cyberheroez.safebrowse.ui.Style.dp
import uk.co.cyberheroez.safebrowse.ui.Style.pageHeader
import uk.co.cyberheroez.safebrowse.ui.Style.primaryButton
import uk.co.cyberheroez.safebrowse.ui.Style.screen

/** Child side of pairing: enter the parent's code, confirm the SAS. */
class LinkParentActivity : AppCompatActivity() {

    private val store by lazy { FamilyStore(this) }
    private val api by lazy { familyApi() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Style.lightSystemBars(this)
        setContentView(codeEntryView())
    }

    private fun codeEntryView(): View = screen(this) {
        pageHeader("Link a parent") { finish() }
        card {
            cardTitle("Pairing code")
            body("Ask your parent for the 8-character code shown on their phone.")
            val field = EditText(context).apply {
                inputType = InputType.TYPE_CLASS_TEXT
                hint = "ABCD2345"
                textSize = 18f
            }
            addView(field, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(12) })
            primaryButton("Link") { join(normalizeCode(field.text.toString())) }
        }
    }

    private fun join(code: String) {
        if (code.length < 8) {
            toast("Enter the full 8-character code")
            return
        }
        setContentView(loadingView())
        lifecycleScope.launch {
            val keys = store.getOrCreateKeyPair()
            val result = withContext(Dispatchers.IO) {
                api.pairJoin(code, keys.publicKeysetB64)
            }
            if (result == null) {
                toast("That code didn't work — check it and try again")
                setContentView(codeEntryView())
                return@launch
            }
            val sas = FamilyCrypto.sas(result.parentPublicKeyB64, keys.publicKeysetB64)
            setContentView(sasView(result.pairingId, result.parentPublicKeyB64, sas))
        }
    }

    private fun sasView(pairingId: String, parentKey: String, sas: String): View = screen(this) {
        pageHeader("Confirm it's safe")
        card {
            cardTitle("Security code")
            body("This should match the 6 digits on your parent's phone.")
            addView(TextView(context).apply {
                text = sas
                textSize = 40f
                letterSpacing = 0.3f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(Style.PRIMARY)
            }, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(16) })
        }
        primaryButton("They match — finish") {
            lifecycleScope.launch {
                store.setParentLink(ParentLink(pairingId, parentKey))
                Toast.makeText(this@LinkParentActivity, "Linked to a parent", Toast.LENGTH_SHORT).show()
                finish()
            }
        }
    }

    private fun loadingView(): View = screen(this) {
        pageHeader("Link a parent")
        card { body("Linking…") }
    }

    private fun toast(message: String) =
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
}
