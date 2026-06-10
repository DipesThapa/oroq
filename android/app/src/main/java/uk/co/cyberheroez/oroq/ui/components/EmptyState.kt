package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** Calm centred empty state for a tab with no data yet. */
@Composable
fun EmptyState(
    title: String,
    subtitle: String,
    accent: Color = OroqColors.BlueAccent,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier.fillMaxWidth().padding(top = 64.dp, start = 24.dp, end = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(56.dp).clip(CircleShape).background(OroqColors.pill(accent)))
        Spacer(Modifier.height(16.dp))
        Text(title, style = OroqType.H3, textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp))
        Text(subtitle, style = OroqType.Body, textAlign = TextAlign.Center)
    }
}

/** Home/Devices first-run invitation (approved direction B): glow, Q ring, one CTA. */
@Composable
fun OnboardingCard(onAddChild: () -> Unit) {
    GlowBox(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(OroqDimens.RadiusCard))
            .background(OroqColors.BgSurface),
    ) {
        Column(
            Modifier.fillMaxWidth().padding(vertical = 28.dp, horizontal = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            QSymbol(size = 56.dp)
            Spacer(Modifier.height(14.dp))
            Text("Add your first device", style = OroqType.H3)
            Spacer(Modifier.height(6.dp))
            Text(
                "Pair a child's phone to start seeing protection, blocked threats and screen time here.",
                style = OroqType.Body,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(16.dp))
            PrimaryButton("Add a child device", onClick = onAddChild)
        }
    }
}

/** The muted "What you'll see here" teaser below the onboarding card. */
@Composable
fun WhatYouWillSeeCard() {
    OroqCard {
        Text("What you'll see here", style = OroqType.BodyOnDark)
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((label, color) in listOf(
                "Protection" to OroqColors.Success,
                "Threats" to OroqColors.Danger,
                "Screen time" to OroqColors.Warning,
            )) {
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.size(24.dp).clip(CircleShape).background(OroqColors.pill(color)))
                    Spacer(Modifier.height(4.dp))
                    Text(label, style = OroqType.Caption)
                }
            }
        }
    }
}
