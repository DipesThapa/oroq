package uk.co.cyberheroez.oroq.ui.components

import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.zxing.BinaryBitmap
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import java.util.concurrent.Executors

/**
 * A live camera viewfinder that decodes QR codes and reports the first one via
 * [onCode]. The caller owns camera-permission gating and decides whether the
 * decoded text is meaningful (this only fires [onCode] once, then stops).
 */
@Composable
fun QrScannerBox(modifier: Modifier = Modifier, onCode: (String) -> Unit) {
    val lifecycle = LocalLifecycleOwner.current
    val context = LocalContext.current
    // Single-shot latch so a held code doesn't fire onCode on every frame.
    val fired = remember { booleanArrayOf(false) }
    AndroidView(
        modifier = modifier.fillMaxSize(),
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
                    if (!fired[0]) {
                        val buffer = proxy.planes[0].buffer
                        val data = ByteArray(buffer.remaining()).also { buffer.get(it) }
                        val source = PlanarYUVLuminanceSource(
                            data, proxy.width, proxy.height, 0, 0, proxy.width, proxy.height, false,
                        )
                        val text = runCatching {
                            reader.decodeWithState(BinaryBitmap(HybridBinarizer(source))).text
                        }.getOrNull()
                        if (text != null) {
                            fired[0] = true
                            ContextCompat.getMainExecutor(ctx).execute { onCode(text) }
                        }
                    }
                    proxy.close()
                }
                provider.unbindAll()
                provider.bindToLifecycle(lifecycle, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
            }, ContextCompat.getMainExecutor(context))
            view
        },
    )
}
