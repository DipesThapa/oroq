package uk.co.cyberheroez.oroq.ui.theme

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.co.cyberheroez.oroq.R

/** Deck §0.1 — colors. Dark is the only mobile theme. */
object OroqColors {
    val BgPrimary = Color(0xFF010715)
    val BgSurface = Color(0xFF0A1420)
    val BgSurface2 = Color(0xFF111A29)
    val BluePrimary = Color(0xFF0A67F3)
    val BlueAccent = Color(0xFF2563EB)
    val BlueLight = Color(0xFF60A5FA)
    val BlueDeep = Color(0xFF1E3A8A)
    val TextPrimary = Color(0xFFFFFFFF)
    val TextSecondary = Color(0xFF8B94A3)
    val Success = Color(0xFF22C55E)
    val Danger = Color(0xFFEF4444)
    val Warning = Color(0xFFF59E0B)
    val PurpleInfo = Color(0xFF8B5CF6)
    val Border = Color.White.copy(alpha = 0.08f)
    val Track = Color.White.copy(alpha = 0.08f)

    /** Status pills: 10–15% alpha fill, full-opacity content (deck rule). */
    fun pill(c: Color) = c.copy(alpha = 0.14f)

    val QTail = Brush.linearGradient(listOf(BlueLight, BlueAccent, BlueDeep))
}

/** Deck §0.2 — Inter, weights 400/500/600/700. */
object OroqType {
    val Inter = FontFamily(
        Font(R.font.inter_regular, FontWeight.Normal),
        Font(R.font.inter_medium, FontWeight.Medium),
        Font(R.font.inter_semibold, FontWeight.SemiBold),
        Font(R.font.inter_bold, FontWeight.Bold),
    )
    val Display = TextStyle(fontFamily = Inter, fontSize = 56.sp, fontWeight = FontWeight.Bold, letterSpacing = (-1.1).sp, lineHeight = 62.sp, color = OroqColors.TextPrimary)
    val H1 = TextStyle(fontFamily = Inter, fontSize = 32.sp, fontWeight = FontWeight.Bold, color = OroqColors.TextPrimary)
    val H2 = TextStyle(fontFamily = Inter, fontSize = 24.sp, fontWeight = FontWeight.SemiBold, color = OroqColors.TextPrimary)
    val H3 = TextStyle(fontFamily = Inter, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = OroqColors.TextPrimary)
    val Body = TextStyle(fontFamily = Inter, fontSize = 15.sp, fontWeight = FontWeight.Normal, color = OroqColors.TextSecondary)
    val BodyOnDark = Body.copy(color = OroqColors.TextPrimary)
    val Caption = TextStyle(fontFamily = Inter, fontSize = 11.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.9.sp, color = OroqColors.TextSecondary)
    val Metric = TextStyle(fontFamily = Inter, fontSize = 48.sp, fontWeight = FontWeight.Bold, color = OroqColors.TextPrimary)
    val MetricSmall = TextStyle(fontFamily = Inter, fontSize = 28.sp, fontWeight = FontWeight.Bold, color = OroqColors.TextPrimary)
}

/** Deck §0.3 — shape & spacing. */
object OroqDimens {
    val RadiusCard = 16.dp
    val RadiusTile = 12.dp
    val RadiusButton = 10.dp
    val PadCard = 16.dp
    val PadScreen = 20.dp
    val GapGrid = 12.dp
    val SectionGap = 12.dp
    val ScreenTop = 16.dp
}
