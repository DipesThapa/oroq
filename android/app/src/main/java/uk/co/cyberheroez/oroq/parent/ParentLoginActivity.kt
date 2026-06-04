package uk.co.cyberheroez.oroq.parent

import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.familyApi
import uk.co.cyberheroez.oroq.ui.Style
import uk.co.cyberheroez.oroq.ui.Style.body
import uk.co.cyberheroez.oroq.ui.Style.card
import uk.co.cyberheroez.oroq.ui.Style.cardTitle
import uk.co.cyberheroez.oroq.ui.Style.dp
import uk.co.cyberheroez.oroq.ui.Style.pageHeader
import uk.co.cyberheroez.oroq.ui.Style.primaryButton
import uk.co.cyberheroez.oroq.ui.Style.screen

/** Passwordless parent login: email, then a 6-digit OTP. */
class ParentLoginActivity : AppCompatActivity() {

    private val store by lazy { FamilyStore(this) }
    private val api by lazy { familyApi() }
    private lateinit var emailField: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Style.lightSystemBars(this)
        setContentView(emailView())
    }

    private fun emailView(): View = screen(this) {
        pageHeader("Parent sign-in")
        card {
            cardTitle("Your email")
            body("We'll email you a 6-digit code. No password needed.")
            emailField = EditText(context).apply {
                inputType = InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
                hint = "you@example.com"
                textSize = 16f
            }
            addView(emailField, fieldParams())
        }
        primaryButton("Send code") { requestCode() }
    }

    private fun otpView(email: String): View = screen(this) {
        pageHeader("Enter your code")
        card {
            cardTitle("6-digit code")
            body("Sent to $email.")
            val otpField = EditText(context).apply {
                inputType = InputType.TYPE_CLASS_NUMBER
                hint = "123456"
                textSize = 16f
            }
            addView(otpField, fieldParams())
            primaryButton("Verify") { verify(email, otpField.text.toString().trim()) }
        }
    }

    private fun fieldParams() = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(12) }

    private fun requestCode() {
        val email = emailField.text.toString().trim()
        if (!email.contains("@")) {
            toast("Enter a valid email")
            return
        }
        lifecycleScope.launch {
            val ok = withContext(Dispatchers.IO) { api.authRequest(email) }
            if (ok) setContentView(otpView(email))
            else toast("Couldn't send the code — check your connection")
        }
    }

    private fun verify(email: String, otp: String) {
        if (otp.length < 6) {
            toast("Enter the 6-digit code")
            return
        }
        lifecycleScope.launch {
            val token = withContext(Dispatchers.IO) { api.authVerify(email, otp) }
            if (token == null) {
                toast("Wrong or expired code")
            } else {
                store.setParentToken(token)
                startActivity(Intent(this@ParentLoginActivity, ParentActivity::class.java))
                finish()
            }
        }
    }

    private fun toast(message: String) =
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
}
