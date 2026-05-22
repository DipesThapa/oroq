package uk.co.cyberheroez.safebrowse.ui

import android.content.Context
import android.view.View
import uk.co.cyberheroez.safebrowse.monitor.UsageReader
import uk.co.cyberheroez.safebrowse.ui.Style.body
import uk.co.cyberheroez.safebrowse.ui.Style.card
import uk.co.cyberheroez.safebrowse.ui.Style.cardTitle
import uk.co.cyberheroez.safebrowse.ui.Style.ghostButton
import uk.co.cyberheroez.safebrowse.ui.Style.primaryButton
import uk.co.cyberheroez.safebrowse.ui.Style.screen

/**
 * A screen asking the parent to grant the two permissions app blocking and
 * screen time need: Usage Access and "display over other apps".
 */
fun monitorPermissionView(context: Context): View = screen(context) {
    card {
        cardTitle("Two permissions needed")
        body(
            "App blocking and screen-time limits need Usage Access (to see which " +
                "app is open) and permission to display over other apps (to show " +
                "the block screen)."
        )
    }
    primaryButton("Grant Usage Access") {
        context.startActivity(UsageReader.usageAccessIntent())
    }
    ghostButton("Grant display-over-apps") {
        context.startActivity(UsageReader.overlayIntent(context))
    }
}
