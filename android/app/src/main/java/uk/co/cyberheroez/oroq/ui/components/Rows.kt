package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** Deck panel 07 category→color map, extended to the real blocklist ids. */
fun categoryColor(cat: String?): Color = when (cat) {
    "phishing", "malware" -> OroqColors.Danger
    "scam", "gambling", "drugs", "violence" -> OroqColors.Warning
    "adult" -> OroqColors.PurpleInfo
    "ok", "allowed" -> OroqColors.Success
    else -> OroqColors.BlueAccent
}

fun categoryTitle(cat: String?, type: String): String = when {
    cat == "phishing" -> "Phishing blocked"
    cat == "malware" -> "Malware blocked"
    cat == "scam" -> "Scam site blocked"
    cat == "adult" -> "Adult content blocked"
    cat == "gambling" -> "Gambling site blocked"
    cat == "drugs" -> "Drugs site blocked"
    cat == "violence" -> "Violent content blocked"
    cat == "social" -> "Social media blocked"
    cat == "gaming" -> "Gaming site blocked"
    type == "app" -> "App blocked"
    else -> "Site blocked"
}

/** "9m ago" / "2h ago" / "1d ago" relative times used across all lists. */
fun relativeTime(ts: Long, now: Long = System.currentTimeMillis()): String {
    val mins = ((now - ts) / 60_000L).coerceAtLeast(0)
    return when {
        mins < 60 -> "${mins}m ago"
        mins < 60 * 24 -> "${mins / 60}h ago"
        else -> "${mins / (60 * 24)}d ago"
    }
}

@Composable
fun ActivityRow(category: String?, type: String, domain: String, ts: Long) {
    val color = categoryColor(category)
    Row(
        Modifier.fillMaxWidth().padding(vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(32.dp).clip(CircleShape).background(OroqColors.pill(color)),
            contentAlignment = Alignment.Center,
        ) { Box(Modifier.size(10.dp).clip(CircleShape).background(color)) }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(categoryTitle(category, type), style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.Medium))
            Text(domain, style = OroqType.Caption, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(relativeTime(ts), style = OroqType.Caption)
    }
}

@Composable
fun DeviceRow(name: String, statusLine: String, isProtected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(name, style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.Medium))
            Text(statusLine, style = OroqType.Caption)
        }
        StatusPill(
            label = if (isProtected) "Protected" else "Unprotected",
            color = if (isProtected) OroqColors.Success else OroqColors.Danger,
        )
    }
}

@Composable
fun RecommendationCard(title: String, sub: String, enabled: Boolean, onEnable: () -> Unit) {
    OroqCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.SemiBold))
                Text(sub, style = OroqType.Caption)
            }
            if (enabled) {
                Text(
                    "Enabled",
                    style = OroqType.Caption.copy(color = OroqColors.Success, fontWeight = FontWeight.SemiBold),
                )
            } else {
                Text(
                    "Enable",
                    style = OroqType.Caption.copy(color = Color.White, fontWeight = FontWeight.SemiBold),
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(OroqColors.BluePrimary)
                        .clickable(onClick = onEnable)
                        .padding(horizontal = 14.dp, vertical = 7.dp),
                )
            }
        }
    }
}

/** Vertical rail with colored dots, grouped by day label (deck panel 12). */
@Composable
fun TimelineGroup(day: String, events: List<Triple<String, String, Color>>) {
    Column {
        Text(day.uppercase(), style = OroqType.Caption)
        Spacer(Modifier.height(8.dp))
        for ((title, meta, color) in events) {
            Row(Modifier.padding(vertical = 6.dp), verticalAlignment = Alignment.Top) {
                Box(Modifier.padding(top = 4.dp).size(8.dp).clip(CircleShape).background(color))
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(title, style = OroqType.BodyOnDark)
                    Text(meta, style = OroqType.Caption)
                }
            }
        }
    }
}
