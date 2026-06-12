package uk.co.cyberheroez.oroq.ui

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.MainActivity
import uk.co.cyberheroez.oroq.family.DeviceRole
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.parent.ParentActivity
import uk.co.cyberheroez.oroq.ui.components.PrimaryButton
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** First-launch screen: is this the child's phone or the parent's phone? */
class RolePickerActivity : ComponentActivity() {

    private val store by lazy { FamilyStore(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { RolePickerScreen(onChoose = ::choose) }
    }

    private fun choose(role: DeviceRole) {
        lifecycleScope.launch {
            store.setRole(role)
            val next = if (role == DeviceRole.PARENT) ParentActivity::class.java
            else MainActivity::class.java
            startActivity(Intent(this@RolePickerActivity, next))
            finish()
        }
    }
}

@Composable
private fun RolePickerScreen(onChoose: (DeviceRole) -> Unit) {
    var selected by remember { mutableStateOf(DeviceRole.CHILD) }
    Column(
        Modifier.fillMaxSize().background(OroqColors.BgPrimary).systemBarsPadding()
            .padding(horizontal = OroqDimens.PadScreen),
    ) {
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Wordmark()
            Spacer(Modifier.weight(1f))
            StepDots(active = 0, count = 3)
        }

        Spacer(Modifier.height(28.dp))
        Text(
            "Who's holding\nthis phone?",
            style = OroqType.H1.copy(fontSize = 34.sp, lineHeight = 38.sp),
        )
        Spacer(Modifier.height(10.dp))
        Text(
            "OroQ behaves differently on each. Pick one to see how setup continues.",
            style = OroqType.Body,
        )

        Spacer(Modifier.height(24.dp))
        RoleOption(
            selected = selected == DeviceRole.CHILD,
            title = "My child",
            body = "Protection runs here — web filtering, app limits and alerts.",
            illustration = { ChildDevice() },
        ) { selected = DeviceRole.CHILD }
        Spacer(Modifier.height(14.dp))
        RoleOption(
            selected = selected == DeviceRole.PARENT,
            title = "Me — I'm the parent",
            body = "This becomes the control center for your family's devices.",
            illustration = { ParentDevice() },
        ) { selected = DeviceRole.PARENT }

        Spacer(Modifier.weight(1f))
        PrimaryButton("Continue") { onChoose(selected) }
        Spacer(Modifier.height(10.dp))
        Text(
            "Wrong pick? Switch roles anytime in Settings.",
            style = OroqType.Caption,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
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
private fun StepDots(active: Int, count: Int) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        repeat(count) { i ->
            if (i == active) {
                Box(Modifier.width(22.dp).height(6.dp).clip(RoundedCornerShape(3.dp)).background(OroqColors.BluePrimary))
            } else {
                Box(Modifier.size(6.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.18f)))
            }
        }
    }
}

@Composable
private fun RoleOption(
    selected: Boolean,
    title: String,
    body: String,
    illustration: @Composable () -> Unit,
    onSelect: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(OroqDimens.RadiusCard))
            .background(OroqColors.BgSurface)
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) OroqColors.Success else OroqColors.Border,
                shape = RoundedCornerShape(OroqDimens.RadiusCard),
            )
            .clickable(onClick = onSelect)
            .padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SelectMark(selected)
                Spacer(Modifier.width(12.dp))
                Text(title, style = OroqType.H3)
            }
            Spacer(Modifier.height(10.dp))
            Text(body, style = OroqType.Body)
        }
        Spacer(Modifier.width(14.dp))
        illustration()
    }
}

@Composable
private fun SelectMark(selected: Boolean) {
    if (selected) {
        Box(
            Modifier.size(26.dp).clip(CircleShape).background(OroqColors.Success),
            contentAlignment = Alignment.Center,
        ) {
            Canvas(Modifier.size(14.dp)) {
                val p = Path().apply {
                    moveTo(size.width * 0.22f, size.height * 0.52f)
                    lineTo(size.width * 0.42f, size.height * 0.72f)
                    lineTo(size.width * 0.78f, size.height * 0.30f)
                }
                drawPath(p, Color.White, style = Stroke(size.width * 0.16f, cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
        }
    } else {
        Box(Modifier.size(26.dp).clip(CircleShape).border(2.dp, OroqColors.TextSecondary.copy(alpha = 0.5f), CircleShape))
    }
}

private val DEVICE_W = 84.dp
private val DEVICE_H = 124.dp

/** Child phone illustration: a shielded device with content lines. */
@Composable
private fun ChildDevice() {
    Canvas(Modifier.size(DEVICE_W, DEVICE_H)) {
        val w = size.width
        val h = size.height
        phoneBody(w, h)
        val cx = w * 0.5f
        val cy = h * 0.32f
        val r = w * 0.18f
        drawCircle(OroqColors.Success.copy(alpha = 0.20f), r, Offset(cx, cy))
        shield(Offset(cx, cy), r * 0.66f, OroqColors.Success)
        contentLines(w, h, startY = 0.56f)
    }
}

/** Parent phone illustration: a dashboard with a bar chart. */
@Composable
private fun ParentDevice() {
    Canvas(Modifier.size(DEVICE_W, DEVICE_H)) {
        val w = size.width
        val h = size.height
        phoneBody(w, h)
        // two header tiles
        val tile = Color.White.copy(alpha = 0.10f)
        drawRoundRect(tile, Offset(w * 0.30f, h * 0.16f), Size(w * 0.16f, h * 0.07f), CornerRadius(w * 0.03f))
        drawRoundRect(tile, Offset(w * 0.52f, h * 0.16f), Size(w * 0.16f, h * 0.07f), CornerRadius(w * 0.03f))
        // bar chart
        val bars = listOf(0.18f, 0.30f, 0.22f, 0.40f, 0.28f)
        val baseY = h * 0.62f
        val bw = w * 0.06f
        bars.forEachIndexed { i, frac ->
            val x = w * 0.30f + i * (bw + w * 0.035f)
            drawRoundRect(
                OroqColors.BlueLight,
                Offset(x, baseY - h * frac),
                Size(bw, h * frac),
                CornerRadius(bw * 0.4f),
            )
        }
        contentLines(w, h, startY = 0.72f)
    }
}

private fun DrawScope.phoneBody(w: Float, h: Float) {
    drawRoundRect(
        OroqColors.BgSurface2,
        Offset(w * 0.14f, 0f),
        Size(w * 0.72f, h),
        CornerRadius(w * 0.16f),
    )
    drawRoundRect(
        OroqColors.Border,
        Offset(w * 0.14f, 0f),
        Size(w * 0.72f, h),
        CornerRadius(w * 0.16f),
        style = Stroke(1.5f),
    )
}

private fun DrawScope.contentLines(w: Float, h: Float, startY: Float) {
    val color = Color.White.copy(alpha = 0.10f)
    val widths = listOf(0.40f, 0.34f)
    widths.forEachIndexed { i, fw ->
        drawRoundRect(
            color,
            Offset(w * 0.30f, h * (startY + i * 0.09f)),
            Size(w * fw, h * 0.035f),
            CornerRadius(h * 0.02f),
        )
    }
}

private fun DrawScope.shield(center: Offset, s: Float, color: Color) {
    val p = Path().apply {
        moveTo(center.x, center.y - s)
        lineTo(center.x + s * 0.85f, center.y - s * 0.45f)
        lineTo(center.x + s * 0.85f, center.y + s * 0.25f)
        cubicTo(center.x + s * 0.85f, center.y + s * 0.85f, center.x + s * 0.45f, center.y + s * 1.15f, center.x, center.y + s * 1.3f)
        cubicTo(center.x - s * 0.45f, center.y + s * 1.15f, center.x - s * 0.85f, center.y + s * 0.85f, center.x - s * 0.85f, center.y + s * 0.25f)
        lineTo(center.x - s * 0.85f, center.y - s * 0.45f)
        close()
    }
    drawPath(p, color)
}
