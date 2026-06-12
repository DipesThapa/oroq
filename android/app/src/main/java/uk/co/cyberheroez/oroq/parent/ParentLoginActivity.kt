package uk.co.cyberheroez.oroq.parent

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.R
import uk.co.cyberheroez.oroq.family.DeviceRole
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.familyApi
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
                onClose = { finish() },
            )
        }
    }
}

@Composable
private fun LoginFlow(onSignedIn: () -> Unit, onClose: () -> Unit) {
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
        // Top bar: back chip on the left, OROQ wordmark centred over the row.
        Box(Modifier.fillMaxWidth().padding(top = 12.dp), contentAlignment = Alignment.Center) {
            BackChip(Modifier.align(Alignment.CenterStart)) {
                if (stage == "otp") { stage = "email"; error = null } else onClose()
            }
            Wordmark()
        }

        Spacer(Modifier.height(28.dp))
        Text("Parent sign-in", style = OroqType.H1)
        Spacer(Modifier.height(8.dp))
        Text(
            if (stage == "email") {
                "We'll email you a 6-digit code. No password needed."
            } else {
                "Enter the 6-digit code we sent to ${email.trim()}."
            },
            style = OroqType.Body,
        )
        Spacer(Modifier.height(28.dp))

        if (stage == "email") {
            FieldLabel("Email address")
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = email, onValueChange = { email = it; error = null },
                placeholder = { Text("you@example.com", style = OroqType.Body) },
                singleLine = true,
                leadingIcon = { Canvas(Modifier.size(20.dp)) { drawEnvelope(OroqColors.TextSecondary) } },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                shape = RoundedCornerShape(OroqDimens.RadiusTile),
                colors = fieldColors(),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
            PrimaryButton(if (busy) "Sending…" else "Send code", enabled = !busy && email.contains("@")) {
                busy = true
                scope.launch {
                    val ok = withContext(Dispatchers.IO) { api.authRequest(email.trim()) }
                    busy = false
                    if (ok) stage = "otp" else error = "Couldn't send the code — check your connection"
                }
            }

            if (GoogleSignIn.isConfigured) {
                Spacer(Modifier.height(24.dp))
                DividerLabel("or continue with")
                Spacer(Modifier.height(16.dp))
                GoogleButton(enabled = !busy) {
                    busy = true
                    scope.launch {
                        when (val result = GoogleSignIn.signIn(context)) {
                            is GoogleSignInResult.Success -> {
                                store.setParentToken(result.sessionToken)
                                store.setRole(DeviceRole.PARENT)
                                onSignedIn()
                            }
                            GoogleSignInResult.Cancelled -> { /* silent — the email form is right here */ }
                            GoogleSignInResult.Unavailable ->
                                error = "Google sign-in isn't available on this device"
                            GoogleSignInResult.Rejected ->
                                error = "Google sign-in failed — try the email code instead"
                        }
                        busy = false
                    }
                }
            }
        } else {
            FieldLabel("6-digit code")
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = otp, onValueChange = { otp = it.filter { c -> c.isDigit() }; error = null },
                placeholder = { Text("123456", style = OroqType.Body) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                shape = RoundedCornerShape(OroqDimens.RadiusTile),
                colors = fieldColors(),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
            PrimaryButton(if (busy) "Verifying…" else "Verify", enabled = !busy && otp.length >= 6) {
                busy = true
                scope.launch {
                    val token = withContext(Dispatchers.IO) { api.authVerify(email.trim(), otp.trim()) }
                    busy = false
                    if (token == null) {
                        error = "Wrong or expired code"
                    } else {
                        store.setParentToken(token)
                        store.setRole(DeviceRole.PARENT)
                        onSignedIn()
                    }
                }
            }
        }

        if (error != null) {
            Spacer(Modifier.height(12.dp))
            Text(error!!, style = OroqType.Caption.copy(color = OroqColors.Danger))
        }

        Spacer(Modifier.weight(1f))
        Footer()
        Spacer(Modifier.height(12.dp))
    }
}

@Composable
private fun Wordmark() {
    val style = OroqType.H2.copy(fontSize = 18.sp, fontWeight = FontWeight.Bold, letterSpacing = 3.sp)
    Row {
        Text("ORO", style = style.copy(color = OroqColors.TextPrimary))
        Text("Q", style = style.copy(color = OroqColors.BluePrimary))
    }
}

@Composable
private fun BackChip(modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .size(40.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(OroqColors.BgSurface)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(18.dp)) {
            val path = Path().apply {
                moveTo(size.width * 0.6f, size.height * 0.2f)
                lineTo(size.width * 0.34f, size.height * 0.5f)
                lineTo(size.width * 0.6f, size.height * 0.8f)
            }
            drawPath(path, OroqColors.TextPrimary, style = Stroke(size.width * 0.12f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@Composable
private fun FieldLabel(text: String) {
    Text(text, style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.SemiBold))
}

@Composable
private fun DividerLabel(text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        HorizontalDivider(Modifier.weight(1f), color = OroqColors.Border)
        Text(
            text,
            style = OroqType.Caption,
            modifier = Modifier.padding(horizontal = 12.dp),
        )
        HorizontalDivider(Modifier.weight(1f), color = OroqColors.Border)
    }
}

@Composable
private fun GoogleButton(enabled: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .height(54.dp)
            .clip(RoundedCornerShape(OroqDimens.RadiusButton))
            .background(Color.White)
            .clickable(enabled = enabled, onClick = onClick),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            painter = painterResource(R.drawable.ic_google_g),
            contentDescription = null,
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.width(12.dp))
        Text(
            "Continue with Google",
            style = OroqType.BodyOnDark.copy(color = Color(0xFF1F2328), fontWeight = FontWeight.SemiBold),
        )
    }
}

@Composable
private fun Footer() {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Canvas(Modifier.size(13.dp)) { drawLock(OroqColors.TextSecondary) }
        Spacer(Modifier.width(6.dp))
        Text("Your family's data is encrypted and never sold.", style = OroqType.Caption)
    }
    Spacer(Modifier.height(6.dp))
    val terms = buildAnnotatedString {
        append("By continuing, you agree to our ")
        withStyle(SpanStyle(color = OroqColors.BlueLight, fontWeight = FontWeight.SemiBold)) { append("Terms of Service") }
        append(" and ")
        withStyle(SpanStyle(color = OroqColors.BlueLight, fontWeight = FontWeight.SemiBold)) { append("Privacy Policy") }
        append(".")
    }
    Text(
        terms,
        style = OroqType.Caption,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = OroqColors.BluePrimary,
    unfocusedBorderColor = OroqColors.Border,
    focusedContainerColor = OroqColors.BgSurface,
    unfocusedContainerColor = OroqColors.BgSurface,
    focusedTextColor = OroqColors.TextPrimary,
    unfocusedTextColor = OroqColors.TextPrimary,
)

private fun DrawScope.drawEnvelope(color: Color) {
    val w = size.width
    val h = size.height
    val s = w * 0.08f
    drawRoundRect(
        color,
        topLeft = Offset(w * 0.08f, h * 0.22f),
        size = Size(w * 0.84f, h * 0.56f),
        cornerRadius = CornerRadius(w * 0.1f),
        style = Stroke(s),
    )
    val flap = Path().apply {
        moveTo(w * 0.14f, h * 0.3f)
        lineTo(w * 0.5f, h * 0.56f)
        lineTo(w * 0.86f, h * 0.3f)
    }
    drawPath(flap, color, style = Stroke(s, cap = StrokeCap.Round, join = StrokeJoin.Round))
}

private fun DrawScope.drawLock(color: Color) {
    val w = size.width
    val h = size.height
    val s = w * 0.1f
    drawRoundRect(
        color,
        topLeft = Offset(w * 0.2f, h * 0.46f),
        size = Size(w * 0.6f, h * 0.44f),
        cornerRadius = CornerRadius(w * 0.1f),
        style = Stroke(s),
    )
    val shackle = Path().apply {
        moveTo(w * 0.33f, h * 0.46f)
        lineTo(w * 0.33f, h * 0.32f)
        cubicTo(w * 0.33f, h * 0.12f, w * 0.67f, h * 0.12f, w * 0.67f, h * 0.32f)
        lineTo(w * 0.67f, h * 0.46f)
    }
    drawPath(shackle, color, style = Stroke(s, cap = StrokeCap.Round))
}
