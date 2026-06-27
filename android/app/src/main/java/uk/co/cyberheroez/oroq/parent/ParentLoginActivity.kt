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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.R
import uk.co.cyberheroez.oroq.family.DeviceRole
import uk.co.cyberheroez.oroq.family.FamilyStore
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
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().background(OroqColors.BgPrimary).systemBarsPadding()
            .padding(horizontal = OroqDimens.PadScreen),
    ) {
        // Top bar: back chip on the left, OROQ wordmark centred over the row.
        Box(Modifier.fillMaxWidth().padding(top = 12.dp), contentAlignment = Alignment.Center) {
            BackChip(Modifier.align(Alignment.CenterStart)) { onClose() }
            Wordmark()
        }

        Spacer(Modifier.height(28.dp))
        Text("Sign in or create your account", style = OroqType.H1)
        Spacer(Modifier.height(8.dp))
        Text(
            "Sign in with your Google account — no password needed.",
            style = OroqType.Body,
        )
        Spacer(Modifier.height(28.dp))

        if (GoogleSignIn.isConfigured) {
            GoogleButton(enabled = !busy) {
                busy = true
                scope.launch {
                    when (val result = GoogleSignIn.signIn(context)) {
                        is GoogleSignInResult.Success -> {
                            store.setParentToken(result.sessionToken)
                            store.setRole(DeviceRole.PARENT)
                            onSignedIn()
                        }
                        GoogleSignInResult.Cancelled -> { /* silent — the button is right here */ }
                        GoogleSignInResult.Unavailable ->
                            error = "Google sign-in isn't available on this device"
                        GoogleSignInResult.Rejected ->
                            error = "Google sign-in failed — please try again"
                    }
                    busy = false
                }
            }
        } else {
            Text(
                "Sign-in is temporarily unavailable. Please try again later.",
                style = OroqType.Body.copy(color = OroqColors.Danger),
            )
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
