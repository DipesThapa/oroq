package uk.co.cyberheroez.oroq.ui.child

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.navigation.NavController
import com.google.zxing.BinaryBitmap
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.family.normalizeCode
import uk.co.cyberheroez.oroq.ui.components.PrimaryButton
import uk.co.cyberheroez.oroq.ui.components.SecondaryLink
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqType
import java.util.concurrent.Executors

/** An OroQ pairing code: 8 chars, letters/digits after normalisation. */
fun looksLikePairCode(text: String): Boolean {
    val t = normalizeCode(text)
    return t.length == 8 && t.all { it.isLetterOrDigit() }
}

@Composable
fun ScanScreen(nav: NavController) = ChildScaffold {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    var granted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED,
        )
    }
    var error by remember { mutableStateOf<String?>(null) }
    var pending by remember { mutableStateOf<PendingLink?>(null) }
    var handled by remember { mutableStateOf(false) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        granted = ok
        // Deck behaviour: denied camera falls back to manual entry.
        if (!ok) nav.popBackStack()
    }
    LaunchedEffect(Unit) { if (!granted) ask.launch(Manifest.permission.CAMERA) }

    val p = pending
    if (p != null) {
        Text("Confirm it's safe", style = OroqType.H2)
        Text("This should match the 6 digits on your parent's phone.", style = OroqType.Body)
        Spacer(Modifier.height(16.dp))
        Text(
            p.sas,
            style = OroqType.Metric.copy(letterSpacing = 8.sp, color = OroqColors.BluePrimary),
        )
        Spacer(Modifier.weight(1f))
        PrimaryButton("They match — continue") {
            scope.launch {
                confirmPairing(context, p)
                nav.navigate("allow")
            }
        }
        SecondaryLink("They don't match") { pending = null; handled = false }
        Spacer(Modifier.height(24.dp))
        return@ChildScaffold
    }

    Text("Scan QR code", style = OroqType.H2)
    Text("Scan the QR code from your parent's OroQ app.", style = OroqType.Body)
    Spacer(Modifier.height(16.dp))
    if (granted) {
        AndroidView(
            factory = { ctx ->
                val view = PreviewView(ctx)
                val executor = Executors.newSingleThreadExecutor()
                val providerFuture = ProcessCameraProvider.getInstance(ctx)
                providerFuture.addListener({
                    val provider = providerFuture.get()
                    val preview = Preview.Builder().build()
                        .also { it.surfaceProvider = view.surfaceProvider }
                    val analysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                    val reader = MultiFormatReader()
                    analysis.setAnalyzer(executor) { proxy ->
                        if (!handled) {
                            val buffer = proxy.planes[0].buffer
                            val data = ByteArray(buffer.remaining()).also { buffer.get(it) }
                            val source = PlanarYUVLuminanceSource(
                                data, proxy.width, proxy.height, 0, 0, proxy.width, proxy.height, false,
                            )
                            val text = runCatching {
                                reader.decodeWithState(BinaryBitmap(HybridBinarizer(source))).text
                            }.getOrNull()
                            if (text != null) {
                                if (looksLikePairCode(text)) {
                                    handled = true
                                    scope.launch {
                                        val result = withContext(Dispatchers.IO) {
                                            joinPairing(ctx, normalizeCode(text))
                                        }
                                        if (result != null) {
                                            pending = result
                                        } else {
                                            handled = false
                                            error = "That code didn't work — ask your parent for a fresh one."
                                        }
                                    }
                                } else {
                                    error = "That's not an OroQ pairing code"
                                }
                            }
                        }
                        proxy.close()
                    }
                    provider.unbindAll()
                    provider.bindToLifecycle(lifecycle, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                }, ContextCompat.getMainExecutor(ctx))
                view
            },
            modifier = Modifier.weight(1f).fillMaxWidth(),
        )
    } else {
        Spacer(Modifier.weight(1f))
    }
    if (error != null) {
        Text(error!!, style = OroqType.Caption.copy(color = OroqColors.Danger))
    }
    Text("Or enter code manually", style = OroqType.Caption)
    SecondaryLink("Cancel") { nav.popBackStack() }
    Spacer(Modifier.height(24.dp))
}
