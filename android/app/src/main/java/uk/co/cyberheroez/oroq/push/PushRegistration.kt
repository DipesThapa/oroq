package uk.co.cyberheroez.oroq.push

import android.content.Context
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import uk.co.cyberheroez.oroq.family.DeviceRole
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.familyApi

object PushRegistration {
    /**
     * Parent-only: enable messaging, fetch the FCM token, register it with the
     * worker. No-op for the child role, when signed out, or when Firebase isn't
     * configured (the whole block is guarded so a missing google-services.json
     * is silent, not a crash).
     */
    fun register(context: Context) {
        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                val store = FamilyStore(context)
                if (store.getRole() != DeviceRole.PARENT) return@runCatching
                val sessionToken = store.getParentToken() ?: return@runCatching
                FirebaseMessaging.getInstance().isAutoInitEnabled = true
                val fcmToken = FirebaseMessaging.getInstance().token.await()
                familyApi().pushRegister(sessionToken, fcmToken)
            }
        }
    }
}
