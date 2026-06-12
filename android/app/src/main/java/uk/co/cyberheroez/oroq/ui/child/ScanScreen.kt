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
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
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
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
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
    var manual by remember { mutableStateOf("") }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        // Deck behaviour: denied camera falls back to the manual code field below.
        granted = ok
    }
    LaunchedEffect(Unit) { if (!granted) ask.launch(Manifest.permission.CAMERA) }

    // Shared join path for both the scanner and the manual field → SAS confirm.
    fun tryJoin(code: String) {
        if (handled || !looksLikePairCode(code)) return
        handled = true
        scope.launch {
            val result = withContext(Dispatchers.IO) { joinPairing(context, normalizeCode(code)) }
            if (result != null) {
                pending = result
            } else {
                handled = false
                error = "That code didn't work — ask your parent for a fresh one."
            }
        }
    }

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

    Column(Modifier.fillMaxWidth()) {
        Text("Scan QR code", style = OroqType.H1)
        Spacer(Modifier.height(8.dp))
        Text(
            "Scan the QR code from your parent's OroQ app.",
            style = OroqType.Body,
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
        )
    }

    Spacer(Modifier.height(20.dp))
    // Square, rounded viewfinder centred like the deck's QR panel.
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .fillMaxWidth(0.78f)
                .aspectRatio(1f)
                .clip(RoundedCornerShape(OroqDimens.RadiusCard))
                .background(OroqColors.BgSurface),
            contentAlignment = Alignment.Center,
        ) {
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
                                            tryJoin(text)
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
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Text("Camera access needed", style = OroqType.Caption)
            }
        }
    }

    Spacer(Modifier.height(16.dp))
    if (error != null) {
        Text(
            error!!,
            style = OroqType.Caption.copy(color = OroqColors.Danger),
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
    }
    Text(
        "Or enter code manually",
        style = OroqType.Caption,
        modifier = Modifier.fillMaxWidth(),
        textAlign = TextAlign.Center,
    )
    Spacer(Modifier.height(10.dp))
    OutlinedTextField(
        value = manual,
        onValueChange = { manual = it; error = null; tryJoin(it) },
        placeholder = {
            Text(
                "Enter code",
                style = OroqType.Body,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
            )
        },
        textStyle = OroqType.BodyOnDark.copy(
            textAlign = TextAlign.Center,
            letterSpacing = 4.sp,
            fontWeight = FontWeight.SemiBold,
        ),
        singleLine = true,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = OroqColors.BluePrimary,
            unfocusedBorderColor = OroqColors.Border,
            focusedTextColor = OroqColors.TextPrimary,
            unfocusedTextColor = OroqColors.TextPrimary,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(12.dp))
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        SecondaryLink("Cancel") { nav.popBackStack() }
    }
    Spacer(Modifier.height(24.dp))
}
