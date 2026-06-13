package uk.co.cyberheroez.oroq.config

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import uk.co.cyberheroez.oroq.monitor.Window
import uk.co.cyberheroez.oroq.monitor.effectiveExtraMinutes
import uk.co.cyberheroez.oroq.monitor.newExtraAfterGrant
import uk.co.cyberheroez.oroq.monitor.schedulesFromJson
import uk.co.cyberheroez.oroq.monitor.schedulesToJson
import java.time.LocalDate

private val Context.dataStore by preferencesDataStore(name = "oroq_config")

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
        val BLOCKED_APPS = stringSetPreferencesKey("blocked_apps")
        val DAILY_LIMIT = intPreferencesKey("daily_limit_minutes")
        val EXTRA_MINUTES = intPreferencesKey("extra_minutes")
        val EXTRA_DATE = stringPreferencesKey("extra_date")
        val SAFE_SEARCH = booleanPreferencesKey("safe_search_on")
        val YT_RESTRICTED = booleanPreferencesKey("yt_restricted_on")
        val APPROVED_APPS = stringSetPreferencesKey("approved_apps")
        val APP_SCHEDULES = stringPreferencesKey("app_schedules_json")
    }

    suspend fun isSafeSearchOn(): Boolean = store.data.first()[Keys.SAFE_SEARCH] ?: false

    suspend fun setSafeSearchOn(on: Boolean) {
        store.edit { it[Keys.SAFE_SEARCH] = on }
    }

    suspend fun isYtRestrictedOn(): Boolean = store.data.first()[Keys.YT_RESTRICTED] ?: false

    suspend fun setYtRestrictedOn(on: Boolean) {
        store.edit { it[Keys.YT_RESTRICTED] = on }
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

    suspend fun getBlockedApps(): Set<String> =
        store.data.first()[Keys.BLOCKED_APPS] ?: emptySet()

    suspend fun setBlockedApps(apps: Set<String>) {
        store.edit { it[Keys.BLOCKED_APPS] = apps }
    }

    /** Packages the parent has approved. Absent = unapproved (default-deny). */
    suspend fun getApprovedApps(): Set<String> =
        store.data.first()[Keys.APPROVED_APPS] ?: emptySet()

    suspend fun setApprovedApps(apps: Set<String>) {
        store.edit { it[Keys.APPROVED_APPS] = apps }
    }

    /** Per-app blocked-time-window schedules. */
    suspend fun getSchedules(): Map<String, List<Window>> =
        schedulesFromJson(store.data.first()[Keys.APP_SCHEDULES] ?: "")

    /** Replaces the schedule for one package; an empty list clears it. */
    suspend fun setAppSchedule(pkg: String, windows: List<Window>) {
        store.edit { prefs ->
            val current = schedulesFromJson(prefs[Keys.APP_SCHEDULES] ?: "").toMutableMap()
            if (windows.isEmpty()) current.remove(pkg) else current[pkg] = windows
            prefs[Keys.APP_SCHEDULES] = schedulesToJson(current)
        }
    }

    suspend fun getDailyLimitMinutes(): Int =
        store.data.first()[Keys.DAILY_LIMIT] ?: 0

    suspend fun setDailyLimitMinutes(minutes: Int) {
        store.edit { it[Keys.DAILY_LIMIT] = minutes }
    }

    /** Extra minutes still valid today (0 if the grant was on an earlier day). */
    suspend fun getExtraMinutes(): Int {
        val prefs = store.data.first()
        val minutes = prefs[Keys.EXTRA_MINUTES] ?: return 0
        val date = prefs[Keys.EXTRA_DATE] ?: return 0
        return effectiveExtraMinutes(minutes, date, LocalDate.now().toString())
    }

    /**
     * Grants [minutes] of additional headroom from now, given the child's
     * current screen-time [todayMinutes]. If the child is already past the
     * limit, the existing overage is absorbed into the baseline so the grant
     * actually unblocks them for [minutes] of further use (a naive add would
     * be eaten by the overage and the time-up screen would reappear within
     * seconds).
     */
    suspend fun grantExtraMinutes(minutes: Int, todayMinutes: Int) {
        val today = LocalDate.now().toString()
        val limit = getDailyLimitMinutes()
        store.edit { prefs ->
            val existing = if (prefs[Keys.EXTRA_DATE] == today) prefs[Keys.EXTRA_MINUTES] ?: 0 else 0
            prefs[Keys.EXTRA_MINUTES] = newExtraAfterGrant(existing, todayMinutes, limit, minutes)
            prefs[Keys.EXTRA_DATE] = today
        }
    }
}
