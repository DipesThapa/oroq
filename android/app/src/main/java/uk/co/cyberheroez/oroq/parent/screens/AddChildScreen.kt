package uk.co.cyberheroez.oroq.parent.screens

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.family.FamilyCrypto
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.PairedChild
import uk.co.cyberheroez.oroq.family.familyApi
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.OroqCard
import uk.co.cyberheroez.oroq.ui.components.PrimaryButton
import uk.co.cyberheroez.oroq.ui.components.SecondaryLink
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** Renders the pairing code as a QR bitmap (white card, deck 5.3 style). */
private fun qrBitmap(text: String, sizePx: Int = 512): Bitmap {
    val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, sizePx, sizePx)
    val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.RGB_565)
    for (x in 0 until sizePx) {
        for (y in 0 until sizePx) {
            bmp.setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
        }
    }
    return bmp
}

private sealed interface AddChildStep {
    data object Name : AddChildStep
    data object Creating : AddChildStep
    data class ShowCode(val code: String, val pairingId: String) : AddChildStep
    data class ConfirmSas(val pairingId: String, val childKey: String, val sas: String) : AddChildStep
    data class Failed(val message: String) : AddChildStep
}

/** Parent side of pairing: name the child, show code + QR, confirm the SAS.
 *  Flow logic ported verbatim from the old AddChildActivity. */
@Composable
fun AddChildScreen(vm: ParentViewModel, nav: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val store = remember { FamilyStore(context) }
    val api = remember { familyApi() }
    var step by remember { mutableStateOf<AddChildStep>(AddChildStep.Name) }
    var name by remember { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .padding(horizontal = OroqDimens.PadScreen),
    ) {
        SecondaryLink("‹ Back") { nav.popBackStack() }
        Text("Add a child", style = OroqType.H2)
        Spacer(Modifier.height(16.dp))

        when (val s = step) {
            AddChildStep.Name -> OroqCard {
                Text("Your child's name", style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.SemiBold))
                Text("Just a label for you — e.g. \"Sita's phone\" or \"Aarav\".", style = OroqType.Caption)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = name, onValueChange = { name = it },
                    placeholder = { Text("Sita's phone", style = OroqType.Body) },
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = OroqColors.BluePrimary,
                        unfocusedBorderColor = OroqColors.Border,
                        focusedTextColor = OroqColors.TextPrimary,
                        unfocusedTextColor = OroqColors.TextPrimary,
                    ),
                )
                Spacer(Modifier.height(12.dp))
                PrimaryButton("Continue", enabled = name.isNotBlank()) {
                    step = AddChildStep.Creating
                    scope.launch {
                        val token = store.getParentToken()
                        if (token == null) {
                            step = AddChildStep.Failed("Please sign in again"); return@launch
                        }
                        val keys = store.getOrCreateKeyPair()
                        val created = withContext(Dispatchers.IO) {
                            api.pairCreate(token, keys.publicKeysetB64, name.trim())
                        }
                        if (created == null) {
                            step = AddChildStep.Failed("Couldn't start pairing — check your connection")
                            return@launch
                        }
                        step = AddChildStep.ShowCode(created.code, created.pairingId)
                        // Poll until the child joins (~80 × 5s covers the code lifetime).
                        repeat(80) {
                            delay(5_000)
                            val record = withContext(Dispatchers.IO) { api.pairGet(created.pairingId) }
                            val childKey = record?.childPublicKeyB64
                            if (record?.paired == true && childKey != null) {
                                step = AddChildStep.ConfirmSas(
                                    created.pairingId, childKey,
                                    FamilyCrypto.sas(keys.publicKeysetB64, childKey),
                                )
                                return@launch
                            }
                        }
                        step = AddChildStep.Failed("Pairing timed out — try again")
                    }
                }
            }

            AddChildStep.Creating -> OroqCard { Text("Creating a pairing…", style = OroqType.Body) }

            is AddChildStep.ShowCode -> {
                OroqCard {
                    Text("On your child's phone", style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.SemiBold))
                    Text(
                        "Open OroQ, choose \"This is my child's phone\", then enter this code or scan the QR:",
                        style = OroqType.Caption,
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        s.code,
                        style = OroqType.Metric.copy(fontSize = 36.sp, letterSpacing = 5.sp),
                    )
                    Spacer(Modifier.height(12.dp))
                    Column(
                        Modifier.clip(RoundedCornerShape(OroqDimens.RadiusTile)).background(Color.White).padding(12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Image(
                            bitmap = remember(s.code) { qrBitmap(s.code) }.asImageBitmap(),
                            contentDescription = "Pairing QR code",
                            modifier = Modifier.size(200.dp),
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Text("Waiting for the child's phone…", style = OroqType.Caption)
                }
            }

            is AddChildStep.ConfirmSas -> {
                OroqCard {
                    Text("Confirm it's safe", style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.SemiBold))
                    Text(
                        "Both phones should show the same 6 digits. Check your child's phone — if they match, the link is genuine.",
                        style = OroqType.Caption,
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        s.sas,
                        style = OroqType.Metric.copy(fontSize = 36.sp, letterSpacing = 8.sp, color = OroqColors.BluePrimary),
                    )
                }
                Spacer(Modifier.height(12.dp))
                PrimaryButton("They match — finish") {
                    scope.launch {
                        store.addChild(PairedChild(s.pairingId, name.trim(), s.childKey))
                        vm.refresh()
                        nav.popBackStack()
                    }
                }
            }

            is AddChildStep.Failed -> {
                OroqCard { Text(s.message, style = OroqType.Body.copy(color = OroqColors.Danger)) }
                Spacer(Modifier.height(12.dp))
                PrimaryButton("Try again") { step = AddChildStep.Name }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}
