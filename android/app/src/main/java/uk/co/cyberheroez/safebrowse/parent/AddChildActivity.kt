package uk.co.cyberheroez.safebrowse.parent

import android.graphics.Typeface
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.safebrowse.family.FamilyCrypto
import uk.co.cyberheroez.safebrowse.family.FamilyStore
import uk.co.cyberheroez.safebrowse.family.PairedChild
import uk.co.cyberheroez.safebrowse.family.familyApi
import uk.co.cyberheroez.safebrowse.ui.Style
import uk.co.cyberheroez.safebrowse.ui.Style.body
import uk.co.cyberheroez.safebrowse.ui.Style.card
import uk.co.cyberheroez.safebrowse.ui.Style.cardTitle
import uk.co.cyberheroez.safebrowse.ui.Style.dp
import uk.co.cyberheroez.safebrowse.ui.Style.pageHeader
import uk.co.cyberheroez.safebrowse.ui.Style.primaryButton
import uk.co.cyberheroez.safebrowse.ui.Style.screen

/** Parent side of pairing: create a pairing, show the code, confirm the SAS. */
class AddChildActivity : AppCompatActivity() {

    private val store by lazy { FamilyStore(this) }
    private val api by lazy { familyApi() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Style.lightSystemBars(this)
        setContentView(loadingView("Creating a pairing…"))
        startPairing()
    }

    private fun startPairing() {
        lifecycleScope.launch {
            val token = store.getParentToken()
            if (token == null) {
                toastAndFinish("Please sign in again")
                return@launch
            }
            val keys = store.getOrCreateKeyPair()
            val created = withContext(Dispatchers.IO) {
                api.pairCreate(token, keys.publicKeysetB64, "Child phone")
            }
            if (created == null) {
                toastAndFinish("Couldn't start pairing — check your connection")
                return@launch
            }
            setContentView(codeView(created.code))
            pollForChild(created.pairingId, keys.publicKeysetB64)
        }
    }

    /** Polls the pairing record until the child has joined. */
    private fun pollForChild(pairingId: String, parentPublicB64: String) {
        lifecycleScope.launch {
            repeat(80) { // ~80 * 5s covers the 10-minute code lifetime
                delay(5_000)
                val record = withContext(Dispatchers.IO) { api.pairGet(pairingId) }
                val childKey = record?.childPublicKeyB64
                if (record?.paired == true && childKey != null) {
                    val sas = FamilyCrypto.sas(parentPublicB64, childKey)
                    setContentView(sasView(pairingId, childKey, sas))
                    return@launch
                }
            }
            toastAndFinish("Pairing timed out — try again")
        }
    }

    private fun codeView(code: String): View = screen(this) {
        pageHeader("Pairing code")
        card {
            cardTitle("On your child's phone")
            body("Open SafeBrowse, choose \"This is my child's phone\", then " +
                "Settings → Link a parent, and enter this code:")
            addView(TextView(context).apply {
                text = code
                textSize = 40f
                letterSpacing = 0.15f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(Style.INK)
            }, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(16) })
            body("Waiting for the child's phone…", Style.MUTED, 16)
        }
    }

    private fun sasView(pairingId: String, childKey: String, sas: String): View = screen(this) {
        pageHeader("Confirm it's safe")
        card {
            cardTitle("Security code")
            body("Both phones should show the same 6 digits. Check your child's " +
                "phone — if they match, the link is genuine.")
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
                store.addChild(PairedChild(pairingId, "Child phone", childKey))
                Toast.makeText(this@AddChildActivity, "Child linked", Toast.LENGTH_SHORT).show()
                finish()
            }
        }
    }

    private fun loadingView(message: String): View = screen(this) {
        pageHeader("Add a child")
        card { body(message) }
    }

    private fun toastAndFinish(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
        finish()
    }
}
