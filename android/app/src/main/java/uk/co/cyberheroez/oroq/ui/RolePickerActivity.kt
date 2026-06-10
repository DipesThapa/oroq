package uk.co.cyberheroez.oroq.ui

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.MainActivity
import uk.co.cyberheroez.oroq.family.DeviceRole
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.parent.ParentActivity
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** First-launch screen: is this the child's phone or the parent's phone? */
class RolePickerActivity : ComponentActivity() {

    private val store by lazy { FamilyStore(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { RolePickerScreen(onChoose = ::choose) }
    }

    private fun choose(role: DeviceRole) {
        lifecycleScope.launch {
            store.setRole(role)
            val next = if (role == DeviceRole.PARENT) ParentActivity::class.java
            else MainActivity::class.java
            startActivity(Intent(this@RolePickerActivity, next))
            finish()
        }
    }
}

@Composable
private fun RolePickerScreen(onChoose: (DeviceRole) -> Unit) {
    Column(
        Modifier.fillMaxSize().background(OroqColors.BgPrimary).systemBarsPadding()
            .padding(horizontal = OroqDimens.PadScreen),
    ) {
        Spacer(Modifier.height(48.dp))
        Text("Welcome to OroQ", style = OroqType.H1)
        Text("Which phone is this?", style = OroqType.Body)
        Spacer(Modifier.height(24.dp))
        RoleCard(
            color = OroqColors.Success,
            title = "This is my child's phone",
            body = "Set up web filtering, app blocking and screen-time limits here.",
        ) { onChoose(DeviceRole.CHILD) }
        Spacer(Modifier.height(14.dp))
        RoleCard(
            color = OroqColors.BluePrimary,
            title = "I'm a parent",
            body = "Link your child's phone and see it from here.",
        ) { onChoose(DeviceRole.PARENT) }
    }
}

@Composable
private fun RoleCard(color: Color, title: String, body: String, onTap: () -> Unit) {
    Column(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(OroqDimens.RadiusCard))
            .background(color)
            .clickable(onClick = onTap)
            .padding(24.dp),
    ) {
        Text(title, style = OroqType.H2.copy(fontWeight = FontWeight.Bold, color = Color.White))
        Spacer(Modifier.height(6.dp))
        Text(body, style = OroqType.Body.copy(color = Color.White.copy(alpha = 0.8f)))
    }
}
