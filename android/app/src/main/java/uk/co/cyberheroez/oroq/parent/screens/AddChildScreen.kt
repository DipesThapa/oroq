package uk.co.cyberheroez.oroq.parent.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.navigation.NavController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.family.FamilyCrypto
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.PairedChild
import uk.co.cyberheroez.oroq.family.familyApi
import uk.co.cyberheroez.oroq.family.looksLikePairCode
import uk.co.cyberheroez.oroq.family.normalizeCode
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.OroqCard
import uk.co.cyberheroez.oroq.ui.components.PrimaryButton
import uk.co.cyberheroez.oroq.ui.components.QrScannerBox
import uk.co.cyberheroez.oroq.ui.components.SecondaryLink
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

private sealed interface AddChildStep {
    data object Name : AddChildStep
    data object ScanOrEnter : AddChildStep
    data object Joining : AddChildStep
    data class ConfirmSas(val pairingId: String, val childKey: String, val sas: String) : AddChildStep
    data class Failed(val message: String) : AddChildStep
}

private fun hasCamera(context: android.content.Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

/**
 * Parent side of (child-led) pairing: name the child, then scan the QR the
 * child's phone is showing — or type its code — to join. The link is bound to
 * this parent account at join time; both then confirm the SAS.
 */
@Composable
fun AddChildScreen(vm: ParentViewModel, nav: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val store = remember { FamilyStore(context) }
    val api = remember { familyApi() }
    var step by remember { mutableStateOf<AddChildStep>(AddChildStep.Name) }
    var name by remember { mutableStateOf("") }

    // Joins the child's pairing by code and moves on to the SAS confirmation.
    fun join(code: String) {
        step = AddChildStep.Joining
        scope.launch {
            val token = store.getParentToken()
            if (token == null) {
                step = AddChildStep.Failed("Please sign in again"); return@launch
            }
            val keys = store.getOrCreateKeyPair()
            val joined = withContext(Dispatchers.IO) {
                api.pairJoin(token, normalizeCode(code), keys.publicKeysetB64, name.trim())
            }
            if (joined == null) {
                step = AddChildStep.Failed("Couldn't pair — check the code and try again")
                return@launch
            }
            step = AddChildStep.ConfirmSas(
                joined.pairingId, joined.childPublicKeyB64,
                // SAS arg order (parent, child) must match the child side.
                FamilyCrypto.sas(keys.publicKeysetB64, joined.childPublicKeyB64),
            )
        }
    }

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
                    colors = fieldColors(),
                )
                Spacer(Modifier.height(12.dp))
                PrimaryButton("Continue", enabled = name.isNotBlank()) {
                    step = AddChildStep.ScanOrEnter
                }
            }

            AddChildStep.ScanOrEnter -> {
                var manual by remember { mutableStateOf("") }
                var camGranted by remember { mutableStateOf(hasCamera(context)) }
                val askCam = rememberLauncherForActivityResult(
                    ActivityResultContracts.RequestPermission(),
                ) { camGranted = it }
                LaunchedEffect(Unit) { if (!camGranted) askCam.launch(Manifest.permission.CAMERA) }

                OroqCard {
                    Text("Scan your child's code", style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.SemiBold))
                    Text(
                        "On the child's phone, open OroQ → \"This is my child's phone\" and show its QR. " +
                            "Scan it here, or type the code shown beneath it.",
                        style = OroqType.Caption,
                    )
                    Spacer(Modifier.height(12.dp))
                    Box(
                        Modifier.fillMaxWidth().aspectRatio(1f)
                            .clip(RoundedCornerShape(OroqDimens.RadiusTile))
                            .background(OroqColors.BgSurface2),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (camGranted) {
                            QrScannerBox(onCode = { if (looksLikePairCode(it)) join(it) })
                        } else {
                            Text("Camera access needed", style = OroqType.Caption)
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = manual, onValueChange = { manual = it },
                        placeholder = { Text("Enter code", style = OroqType.Body) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                        colors = fieldColors(),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(12.dp))
                    PrimaryButton("Pair", enabled = looksLikePairCode(manual)) { join(manual) }
                }
            }

            AddChildStep.Joining -> OroqCard { Text("Pairing…", style = OroqType.Body) }

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
                PrimaryButton("Try again") { step = AddChildStep.ScanOrEnter }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = OroqColors.BluePrimary,
    unfocusedBorderColor = OroqColors.Border,
    focusedTextColor = OroqColors.TextPrimary,
    unfocusedTextColor = OroqColors.TextPrimary,
)
