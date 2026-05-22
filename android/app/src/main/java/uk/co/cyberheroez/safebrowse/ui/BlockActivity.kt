package uk.co.cyberheroez.safebrowse.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.safebrowse.config.ConfigRepository
import uk.co.cyberheroez.safebrowse.ui.Style.body
import uk.co.cyberheroez.safebrowse.ui.Style.card
import uk.co.cyberheroez.safebrowse.ui.Style.cardTitle
import uk.co.cyberheroez.safebrowse.ui.Style.ghostButton
import uk.co.cyberheroez.safebrowse.ui.Style.primaryButton
import uk.co.cyberheroez.safebrowse.ui.Style.screen

/** Full-screen screen shown when an app is blocked or screen time is up. */
class BlockActivity : AppCompatActivity() {

    private val config by lazy { ConfigRepository(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val reason = intent.getStringExtra(EXTRA_REASON) ?: REASON_APP
        setContentView(if (reason == REASON_TIME) timeUpView() else appBlockedView())
    }

    /** Back returns to the launcher, never to the blocked app. */
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() = goHome()

    private fun appBlockedView(): View = screen(this) {
        card {
            cardTitle("App blocked")
            body("This app has been blocked by SafeBrowse.")
        }
        primaryButton("Go to home screen") { goHome() }
    }

    private fun timeUpView(): View = screen(this) {
        card {
            cardTitle("Screen time is up")
            body("Today's screen-time limit has been reached. A parent can grant more time with the PIN.")
        }
        primaryButton("Parent: grant 30 more minutes") { promptForExtraTime() }
        ghostButton("Go to home screen") { goHome() }
    }

    private fun promptForExtraTime() {
        showPinPrompt(
            context = this,
            title = "Enter parent PIN",
            onEntered = { pin ->
                lifecycleScope.launch {
                    if (config.verifyPin(pin)) {
                        config.grantExtraMinutes(30)
                        Toast.makeText(this@BlockActivity, "30 minutes granted", Toast.LENGTH_SHORT).show()
                        finish()
                    } else {
                        Toast.makeText(this@BlockActivity, "Wrong PIN", Toast.LENGTH_SHORT).show()
                    }
                }
            },
        )
    }

    private fun goHome() {
        startActivity(
            Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_HOME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        finish()
    }

    companion object {
        const val EXTRA_REASON = "reason"
        const val REASON_APP = "APP"
        const val REASON_TIME = "TIME"
    }
}
