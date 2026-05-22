package uk.co.cyberheroez.safebrowse.config

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

private val Context.dataStore by preferencesDataStore(name = "safebrowse_config")

/**
 * Persists parent configuration: the PIN and recovery code (as salted PBKDF2
 * hashes) and the set of enabled categories. All reads/writes are suspending.
 */
class ConfigRepository(context: Context) {

    private val store = context.applicationContext.dataStore

    private object Keys {
        val PIN_HASH = stringPreferencesKey("pin_hash")
        val PIN_SALT = stringPreferencesKey("pin_salt")
        val RECOVERY_HASH = stringPreferencesKey("recovery_hash")
        val RECOVERY_SALT = stringPreferencesKey("recovery_salt")
        val CATEGORIES = stringSetPreferencesKey("enabled_categories")
        val ONBOARDED = booleanPreferencesKey("onboarding_done")
    }

    suspend fun isOnboardingComplete(): Boolean =
        store.data.first()[Keys.ONBOARDED] ?: false

    /** Stores the PIN, recovery code, and categories, and marks onboarding done. */
    suspend fun completeOnboarding(pin: String, recoveryCode: String, categories: Set<String>) {
        val pinSalt = PinHasher.newSalt()
        val recoverySalt = PinHasher.newSalt()
        store.edit { prefs ->
            prefs[Keys.PIN_HASH] = PinHasher.hash(pin, pinSalt)
            prefs[Keys.PIN_SALT] = pinSalt
            prefs[Keys.RECOVERY_HASH] = PinHasher.hash(recoveryCode, recoverySalt)
            prefs[Keys.RECOVERY_SALT] = recoverySalt
            prefs[Keys.CATEGORIES] = categories
            prefs[Keys.ONBOARDED] = true
        }
    }

    suspend fun verifyPin(pin: String): Boolean {
        val prefs = store.data.first()
        val hash = prefs[Keys.PIN_HASH] ?: return false
        val salt = prefs[Keys.PIN_SALT] ?: return false
        return PinHasher.verify(pin, salt, hash)
    }

    suspend fun verifyRecoveryCode(code: String): Boolean {
        val prefs = store.data.first()
        val hash = prefs[Keys.RECOVERY_HASH] ?: return false
        val salt = prefs[Keys.RECOVERY_SALT] ?: return false
        return PinHasher.verify(code.uppercase().trim(), salt, hash)
    }

    suspend fun setPin(pin: String) {
        val salt = PinHasher.newSalt()
        store.edit { prefs ->
            prefs[Keys.PIN_HASH] = PinHasher.hash(pin, salt)
            prefs[Keys.PIN_SALT] = salt
        }
    }

    suspend fun getEnabledCategories(): Set<String> =
        store.data.first()[Keys.CATEGORIES] ?: Categories.DEFAULT_ENABLED

    suspend fun setEnabledCategories(categories: Set<String>) {
        store.edit { it[Keys.CATEGORIES] = categories }
    }
}
