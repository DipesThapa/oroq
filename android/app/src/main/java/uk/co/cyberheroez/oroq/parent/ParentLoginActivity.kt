package uk.co.cyberheroez.oroq.parent

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.familyApi
import uk.co.cyberheroez.oroq.ui.components.OroqCard
import uk.co.cyberheroez.oroq.ui.components.OroqWordmark
import uk.co.cyberheroez.oroq.ui.components.PrimaryButton
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** Passwordless parent login: email, then a 6-digit OTP. */
class ParentLoginActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            LoginFlow(
                onSignedIn = {
                    startActivity(Intent(this, ParentActivity::class.java))
                    finish()
                },
            )
        }
    }
}

@Composable
private fun LoginFlow(onSignedIn: () -> Unit) {
    val scope = rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current
    val store = remember { FamilyStore(context) }
    val api = remember { familyApi() }
    var email by remember { mutableStateOf("") }
    var otp by remember { mutableStateOf("") }
    var stage by remember { mutableStateOf("email") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().background(OroqColors.BgPrimary).systemBarsPadding()
            .padding(horizontal = OroqDimens.PadScreen),
    ) {
        Spacer(Modifier.height(48.dp))
        OroqWordmark()
        Spacer(Modifier.height(24.dp))
        Text("Parent sign-in", style = OroqType.H2)

        if (GoogleSignIn.isConfigured && stage == "email") {
            Spacer(Modifier.height(16.dp))
            PrimaryButton(if (busy) "Signing in…" else "Continue with Google", enabled = !busy) {
                busy = true
                scope.launch {
                    when (val result = GoogleSignIn.signIn(context)) {
                        is GoogleSignInResult.Success -> {
                            store.setParentToken(result.sessionToken)
                            onSignedIn()
                        }
                        GoogleSignInResult.Cancelled -> { /* silent — email form is right there */ }
                        GoogleSignInResult.Unavailable ->
                            error = "Google sign-in isn't available on this device"
                        GoogleSignInResult.Rejected ->
                            error = "Google sign-in failed — try the email code instead"
                    }
                    busy = false
                }
            }
            Spacer(Modifier.height(12.dp))
            Text(
                "or",
                style = OroqType.Caption,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
        }
        Spacer(Modifier.height(16.dp))

        if (stage == "email") {
            OroqCard {
                Text("Your email", style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.SemiBold))
                Text("We'll email you a 6-digit code. No password needed.", style = OroqType.Caption)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = email, onValueChange = { email = it; error = null },
                    placeholder = { Text("you@example.com", style = OroqType.Body) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    colors = loginFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Spacer(Modifier.height(12.dp))
            PrimaryButton(if (busy) "Sending…" else "Send code", enabled = !busy && email.contains("@")) {
                busy = true
                scope.launch {
                    val ok = withContext(Dispatchers.IO) { api.authRequest(email.trim()) }
                    busy = false
                    if (ok) stage = "otp" else error = "Couldn't send the code — check your connection"
                }
            }
        } else {
            OroqCard {
                Text("6-digit code", style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.SemiBold))
                Text("Sent to ${email.trim()}.", style = OroqType.Caption)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = otp, onValueChange = { otp = it.filter { c -> c.isDigit() }; error = null },
                    placeholder = { Text("123456", style = OroqType.Body) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = loginFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Spacer(Modifier.height(12.dp))
            PrimaryButton(if (busy) "Verifying…" else "Verify", enabled = !busy && otp.length >= 6) {
                busy = true
                scope.launch {
                    val token = withContext(Dispatchers.IO) { api.authVerify(email.trim(), otp.trim()) }
                    busy = false
                    if (token == null) {
                        error = "Wrong or expired code"
                    } else {
                        store.setParentToken(token)
                        onSignedIn()
                    }
                }
            }
        }
        if (error != null) {
            Spacer(Modifier.height(8.dp))
            Text(error!!, style = OroqType.Caption.copy(color = OroqColors.Danger))
        }
    }
}

@Composable
private fun loginFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = OroqColors.BluePrimary,
    unfocusedBorderColor = OroqColors.Border,
    focusedTextColor = OroqColors.TextPrimary,
    unfocusedTextColor = OroqColors.TextPrimary,
)
