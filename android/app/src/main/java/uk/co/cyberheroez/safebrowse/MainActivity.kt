package uk.co.cyberheroez.safebrowse

import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import uk.co.cyberheroez.safebrowse.vpn.SafeBrowseVpnService

/**
 * Plan 2 debug screen: start and stop the VPN filter. The real parent-facing
 * UI (onboarding, status, PIN, settings) is built in Plan 3.
 */
class MainActivity : AppCompatActivity() {

    /** Launches the system VPN-consent dialog; starts the service if granted. */
    private val vpnConsent = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) startVpnService()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildLayout())
    }

    private fun buildLayout(): LinearLayout {
        val pad = (24 * resources.displayMetrics.density).toInt()
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setPadding(pad, pad, pad, pad)
            addView(TextView(context).apply {
                text = getString(R.string.app_name)
                textSize = 28f
                gravity = Gravity.CENTER
            })
            addView(Button(context).apply {
                text = "Start protection"
                setOnClickListener { requestVpn() }
            })
            addView(Button(context).apply {
                text = "Stop protection"
                setOnClickListener { stopVpnService() }
            })
        }
    }

    private fun requestVpn() {
        val intent = VpnService.prepare(this)
        if (intent != null) vpnConsent.launch(intent) else startVpnService()
    }

    private fun startVpnService() {
        startService(Intent(this, SafeBrowseVpnService::class.java))
    }

    private fun stopVpnService() {
        startService(
            Intent(this, SafeBrowseVpnService::class.java)
                .setAction(SafeBrowseVpnService.ACTION_STOP)
        )
    }
}
