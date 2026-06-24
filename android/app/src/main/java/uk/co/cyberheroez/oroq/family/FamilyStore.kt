package uk.co.cyberheroez.oroq.family

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import org.json.JSONObject

private val Context.familyDataStore by preferencesDataStore(name = "family_config")

/** Which side of Family Link this device is. */
enum class DeviceRole { CHILD, PARENT }

/** A child paired to this parent device. */
data class PairedChild(
    val pairingId: String,
    val label: String,
    val childPublicKeyB64: String,
)

/** The parent this child device is linked to. */
data class ParentLink(
    val pairingId: String,
    val parentPublicKeyB64: String,
)

/**
 * Persists Family Link state: the device role, the parent session token, this
 * device's key pair, and pairing records. All reads/writes are suspending.
 */
class FamilyStore(context: Context) {

    private val store = context.applicationContext.familyDataStore

    private object Keys {
        val ROLE = stringPreferencesKey("device_role")
        val PARENT_TOKEN = stringPreferencesKey("parent_token")
        val PRIVATE_KEY = stringPreferencesKey("own_private_keyset")
        val PUBLIC_KEY = stringPreferencesKey("own_public_keyset")
        val CHILDREN = stringSetPreferencesKey("paired_children")
        val PARENT_LINK = stringPreferencesKey("parent_link")
        val CHILD_TOKEN = stringPreferencesKey("child_token")
        val LAST_COMMAND_TS = longPreferencesKey("last_command_ts")
    }

    /** Highest parent send-time (ts) of any command applied — anti-replay floor. */
    suspend fun getLastCommandTs(): Long = store.data.first()[Keys.LAST_COMMAND_TS] ?: 0L

    suspend fun setLastCommandTs(ts: Long) {
        store.edit { it[Keys.LAST_COMMAND_TS] = ts }
    }

    suspend fun getRole(): DeviceRole? =
        store.data.first()[Keys.ROLE]?.let { runCatching { DeviceRole.valueOf(it) }.getOrNull() }

    suspend fun setRole(role: DeviceRole) {
        store.edit { it[Keys.ROLE] = role.name }
    }

    suspend fun getParentToken(): String? = store.data.first()[Keys.PARENT_TOKEN]

    suspend fun setParentToken(token: String) {
        store.edit { it[Keys.PARENT_TOKEN] = token }
    }

    /** Sign-out: drops the parent session token (children stay paired). */
    suspend fun clearParentToken() {
        store.edit { it.remove(Keys.PARENT_TOKEN) }
    }

    /** Account deletion: wipe the parent session token and all paired-child records. */
    suspend fun clearParentAccount() {
        store.edit {
            it.remove(Keys.PARENT_TOKEN)
            it.remove(Keys.CHILDREN)
        }
    }

    /** Returns this device's key pair, generating and storing one on first use. */
    suspend fun getOrCreateKeyPair(): FamilyKeyPair {
        val prefs = store.data.first()
        val priv = prefs[Keys.PRIVATE_KEY]
        val pub = prefs[Keys.PUBLIC_KEY]
        if (priv != null && pub != null) return FamilyKeyPair(priv, pub)
        val fresh = FamilyCrypto.generateKeyPair()
        store.edit {
            it[Keys.PRIVATE_KEY] = fresh.privateKeysetB64
            it[Keys.PUBLIC_KEY] = fresh.publicKeysetB64
        }
        return fresh
    }

    suspend fun getChildren(): List<PairedChild> =
        (store.data.first()[Keys.CHILDREN] ?: emptySet()).mapNotNull { decodeChild(it) }

    suspend fun addChild(child: PairedChild) {
        store.edit { prefs ->
            val current = prefs[Keys.CHILDREN] ?: emptySet()
            prefs[Keys.CHILDREN] = current + encodeChild(child)
        }
    }

    /** Removes a paired child by pairing id (unpair). */
    suspend fun removeChild(pairingId: String) {
        store.edit { prefs ->
            val current = prefs[Keys.CHILDREN] ?: emptySet()
            prefs[Keys.CHILDREN] = current.filterNot { decodeChild(it)?.pairingId == pairingId }.toSet()
        }
    }

    /** This child device's per-pairing bearer token (sent on /sync and /cmd). */
    suspend fun getChildToken(): String? = store.data.first()[Keys.CHILD_TOKEN]

    suspend fun setChildToken(token: String) {
        store.edit { it[Keys.CHILD_TOKEN] = token }
    }

    suspend fun getParentLink(): ParentLink? =
        store.data.first()[Keys.PARENT_LINK]?.let { decodeLink(it) }

    suspend fun setParentLink(link: ParentLink) {
        store.edit {
            it[Keys.PARENT_LINK] =
                JSONObject().put("id", link.pairingId).put("pk", link.parentPublicKeyB64).toString()
        }
    }

    /** Blocking read of the parent token — for use off the main thread only. */
    fun tokenBlocking(): String? = kotlinx.coroutines.runBlocking { getParentToken() }

    /** Blocking read of the device key pair — for use off the main thread only. */
    fun keyPairBlocking(): FamilyKeyPair = kotlinx.coroutines.runBlocking { getOrCreateKeyPair() }

    /** Blocking read of the paired children — for use off the main thread only. */
    fun childrenBlocking(): List<PairedChild> = kotlinx.coroutines.runBlocking { getChildren() }

    private fun encodeChild(c: PairedChild): String =
        JSONObject().put("id", c.pairingId).put("label", c.label).put("pk", c.childPublicKeyB64).toString()

    private fun decodeChild(text: String): PairedChild? = runCatching {
        val j = JSONObject(text)
        PairedChild(j.getString("id"), j.getString("label"), j.getString("pk"))
    }.getOrNull()

    private fun decodeLink(text: String): ParentLink? = runCatching {
        val j = JSONObject(text)
        ParentLink(j.getString("id"), j.getString("pk"))
    }.getOrNull()
}
