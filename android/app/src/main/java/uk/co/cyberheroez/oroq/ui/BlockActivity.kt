package uk.co.cyberheroez.oroq.ui

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.family.pollAndApplyCommands
import uk.co.cyberheroez.oroq.ui.components.PrimaryButton
import uk.co.cyberheroez.oroq.ui.components.QSymbol
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/**
 * Full-screen screen shown when an app is blocked or screen time is up.
 *
 * The only action is "Go to home screen" — there is no local PIN escape.
 * On the time's-up variant, the activity polls the parent every 30 s for a
 * grant-extra-time command and dismisses itself the moment one is applied.
 */
class BlockActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val reason = intent.getStringExtra(EXTRA_REASON) ?: REASON_APP
        // Back returns to the launcher, never to the blocked app.
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() = goHome()
            },
        )
        setContent { BlockScreen(reason = reason, onGoHome = ::goHome) }
        if (reason == REASON_TIME) pollForRemoteGrant()
    }

    /** While the time's-up screen shows, checks for a remote grant every 30s. */
    private fun pollForRemoteGrant() {
        lifecycleScope.launch {
            repeat(40) { // ~20 minutes of polling
                delay(30_000)
                val applied = runCatching {
                    pollAndApplyCommands(applicationContext)
                }.getOrDefault(0)
                if (applied > 0) {
                    Toast.makeText(
                        this@BlockActivity, "A parent granted more time", Toast.LENGTH_LONG,
                    ).show()
                    finish()
                    return@launch
                }
            }
        }
    }

    private fun goHome() {
        startActivity(
            Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_HOME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        finish()
    }

    companion object {
        const val EXTRA_REASON = "reason"
        const val REASON_APP = "APP"
        const val REASON_TIME = "TIME"
        const val REASON_UNAPPROVED = "UNAPPROVED"
        const val REASON_SCHEDULE = "SCHEDULE"
    }
}

@Composable
private fun BlockScreen(reason: String, onGoHome: () -> Unit) {
    val isTime = reason == BlockActivity.REASON_TIME
    val accent = if (isTime) OroqColors.BluePrimary else OroqColors.Danger
    val title = when (reason) {
        BlockActivity.REASON_TIME -> "Screen time's up"
        BlockActivity.REASON_UNAPPROVED -> "Not allowed yet"
        BlockActivity.REASON_SCHEDULE -> "Blocked right now"
        else -> "App blocked"
    }
    val body = when (reason) {
        BlockActivity.REASON_TIME ->
            "Today's screen-time limit has been reached. A parent can grant more time remotely."
        BlockActivity.REASON_UNAPPROVED ->
            "Ask a parent to approve this app before you can use it."
        BlockActivity.REASON_SCHEDULE ->
            "This app is outside its allowed hours. It'll unlock automatically later."
        else -> "This app has been blocked by OroQ."
    }
    Column(
        Modifier.fillMaxSize().background(OroqColors.BgPrimary).systemBarsPadding()
            .padding(horizontal = OroqDimens.PadScreen),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.weight(1f))
        Box(
            Modifier.size(110.dp).clip(CircleShape).background(OroqColors.pill(accent)),
            contentAlignment = Alignment.Center,
        ) { QSymbol(64.dp) }
        Spacer(Modifier.height(26.dp))
        Text(
            title,
            style = OroqType.H1,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(10.dp))
        Text(
            body,
            style = OroqType.Body,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.weight(1f))
        PrimaryButton("Go to home screen", onClick = onGoHome)
        Spacer(Modifier.height(40.dp))
    }
}
