package uk.co.cyberheroez.oroq.ui

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.co.cyberheroez.oroq.R
import uk.co.cyberheroez.oroq.parent.ParentActivity
import uk.co.cyberheroez.oroq.ui.components.GlowBox
import uk.co.cyberheroez.oroq.ui.components.OroqWordmark
import uk.co.cyberheroez.oroq.ui.components.PrimaryButton
import uk.co.cyberheroez.oroq.ui.components.SecondaryLink
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/**
 * First-launch welcome screen (deck onboarding): brand, value proposition, the
 * family hero illustration and the three pillars, then "Get started" into the
 * role picker. Returning parents tap "Sign in" to jump straight to parent auth.
 */
class WelcomeActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            WelcomeScreen(
                onGetStarted = {
                    startActivity(Intent(this, RolePickerActivity::class.java))
                },
                onSignIn = {
                    // Existing-parent entry: ParentActivity gates to sign-in, and a
                    // successful sign-in is what claims the parent role. Backing out
                    // without signing in leaves the role unset, so the role picker
                    // stays reachable (no lock-in for a mis-tap).
                    startActivity(Intent(this, ParentActivity::class.java))
                },
            )
        }
    }
}

@Composable
private fun WelcomeScreen(onGetStarted: () -> Unit, onSignIn: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .background(OroqColors.BgPrimary)
            .systemBarsPadding()
            .padding(horizontal = OroqDimens.PadScreen),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(24.dp))
        OroqWordmark(fontSize = 22.sp)

        Spacer(Modifier.height(28.dp))
        Text("Welcome to OroQ", style = OroqType.H1, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(
            "Your digital safety companion.",
            style = OroqType.Body,
            textAlign = TextAlign.Center,
        )

        // Hero illustration with the brand glow, taking the free vertical space.
        GlowBox(
            Modifier
                .fillMaxWidth()
                .weight(1f),
        ) {
            Image(
                painter = painterResource(R.drawable.welcome_hero),
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(vertical = 12.dp)
                    .align(Alignment.Center),
            )
        }

        FeatureCard()

        Spacer(Modifier.height(20.dp))
        PrimaryButton("Get started", onClick = onGetStarted)
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Already have an account?", style = OroqType.Body)
            SecondaryLink("Sign in", onClick = onSignIn)
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun FeatureCard() {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(OroqDimens.RadiusCard))
            .background(OroqColors.BgSurface)
            .padding(vertical = 18.dp, horizontal = 18.dp),
    ) {
        FeatureRow(FeatureGlyph.SHIELD, "AI-powered threat protection")
        Spacer(Modifier.height(16.dp))
        FeatureRow(FeatureGlyph.MONITOR, "Real-time activity monitoring")
        Spacer(Modifier.height(16.dp))
        FeatureRow(FeatureGlyph.LOCK, "Privacy-first by design")
    }
}

@Composable
private fun FeatureRow(glyph: FeatureGlyph, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(OroqDimens.RadiusTile))
                .background(OroqColors.BgSurface2),
            contentAlignment = Alignment.Center,
        ) {
            FeatureIcon(glyph)
        }
        Spacer(Modifier.width(14.dp))
        Text(text, style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.Medium))
    }
}

private enum class FeatureGlyph { SHIELD, MONITOR, LOCK }

/** Hand-drawn line glyphs (the app ships no icon font; deck §1 aesthetic). */
@Composable
private fun FeatureIcon(glyph: FeatureGlyph) {
    val tint = OroqColors.BlueLight
    Canvas(Modifier.size(20.dp)) {
        when (glyph) {
            FeatureGlyph.SHIELD -> drawShield(tint)
            FeatureGlyph.MONITOR -> drawMonitor(tint)
            FeatureGlyph.LOCK -> drawLock(tint)
        }
    }
}

private fun DrawScope.drawShield(tint: Color) {
    val w = size.width
    val h = size.height
    val s = w * 0.09f
    val path = Path().apply {
        moveTo(w * 0.5f, h * 0.06f)
        lineTo(w * 0.88f, h * 0.22f)
        lineTo(w * 0.88f, h * 0.52f)
        // taper to the point
        cubicTo(w * 0.88f, h * 0.78f, w * 0.7f, h * 0.9f, w * 0.5f, h * 0.96f)
        cubicTo(w * 0.3f, h * 0.9f, w * 0.12f, h * 0.78f, w * 0.12f, h * 0.52f)
        lineTo(w * 0.12f, h * 0.22f)
        close()
    }
    drawPath(path, color = tint, style = Stroke(width = s, join = StrokeJoin.Round))
    // check mark inside
    val check = Path().apply {
        moveTo(w * 0.34f, h * 0.5f)
        lineTo(w * 0.46f, h * 0.62f)
        lineTo(w * 0.68f, h * 0.36f)
    }
    drawPath(check, color = tint, style = Stroke(width = s, cap = StrokeCap.Round, join = StrokeJoin.Round))
}

private fun DrawScope.drawMonitor(tint: Color) {
    val w = size.width
    val h = size.height
    val s = w * 0.09f
    // eye outline (almond) approximated with two arcs in a path
    val eye = Path().apply {
        moveTo(w * 0.08f, h * 0.5f)
        cubicTo(w * 0.3f, h * 0.18f, w * 0.7f, h * 0.18f, w * 0.92f, h * 0.5f)
        cubicTo(w * 0.7f, h * 0.82f, w * 0.3f, h * 0.82f, w * 0.08f, h * 0.5f)
        close()
    }
    drawPath(eye, color = tint, style = Stroke(width = s, join = StrokeJoin.Round))
    drawCircle(color = tint, radius = w * 0.16f, center = Offset(w * 0.5f, h * 0.5f))
}

private fun DrawScope.drawLock(tint: Color) {
    val w = size.width
    val h = size.height
    val s = w * 0.09f
    // body
    val bodyTop = h * 0.46f
    drawRoundRect(
        color = tint,
        topLeft = Offset(w * 0.22f, bodyTop),
        size = androidx.compose.ui.geometry.Size(w * 0.56f, h * 0.42f),
        cornerRadius = androidx.compose.ui.geometry.CornerRadius(w * 0.08f),
        style = Stroke(width = s),
    )
    // shackle arc
    val shackle = Path().apply {
        moveTo(w * 0.34f, bodyTop)
        lineTo(w * 0.34f, h * 0.34f)
        cubicTo(w * 0.34f, h * 0.14f, w * 0.66f, h * 0.14f, w * 0.66f, h * 0.34f)
        lineTo(w * 0.66f, bodyTop)
    }
    drawPath(shackle, color = tint, style = Stroke(width = s, cap = StrokeCap.Round, join = StrokeJoin.Round))
    // keyhole
    drawCircle(color = tint, radius = w * 0.05f, center = Offset(w * 0.5f, h * 0.64f))
}
