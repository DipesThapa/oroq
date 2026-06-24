package uk.co.cyberheroez.oroq.family

import org.json.JSONObject

/**
 * A remote-control instruction from the parent.
 *
 * [type] is one of the constants below. Different commands carry different
 * payload shapes, so both an integer and a string payload slot exist; each
 * command only uses what it needs (the others stay at their default).
 *
 *  - [GRANT_EXTRA_TIME]  → [intValue] is minutes to grant.
 *  - [SET_DAILY_LIMIT]   → [intValue] is the new daily limit in minutes.
 *  - [SET_CATEGORIES]    → [stringValue] is a comma-joined list of category
 *    ids (e.g. `"adult,gambling"`). Empty string means "no categories
 *    blocked".
 *  - [SET_BLOCKED_APPS]  → [stringValue] is a comma-joined list of package
 *    names (e.g. `"com.instagram.android,com.zhiliaoapp.musically"`). Empty
 *    string means "no apps blocked".
 */
data class FamilyCommand(
    val type: String,
    val intValue: Int = 0,
    val stringValue: String = "",
    /** Parent send-time epoch-ms, stamped at enqueue. The child rejects any
     *  command whose [ts] is not newer than the last it applied, so a captured
     *  command can't be replayed (audit, anti-replay). 0 = unstamped/legacy. */
    val ts: Long = 0,
) {
    fun toJson(): String = JSONObject()
        .put("type", type)
        .put("intValue", intValue)
        .put("stringValue", stringValue)
        .put("ts", ts)
        .toString()

    companion object {
        const val GRANT_EXTRA_TIME = "grant_extra_time"
        const val SET_DAILY_LIMIT = "set_daily_limit"
        const val SET_CATEGORIES = "set_categories"
        const val SET_BLOCKED_APPS = "set_blocked_apps"
        const val SET_PROTECTION = "set_protection"
        const val SET_SAFE_SEARCH = "set_safe_search"
        const val SET_YT_RESTRICTED = "set_yt_restricted"
        const val SET_APPROVED_APPS = "set_approved_apps"
        const val SET_APP_SCHEDULE = "set_app_schedule"
    }
}

/** Parses a command from its JSON wire form. */
fun parseCommand(text: String): FamilyCommand {
    val json = JSONObject(text)
    return FamilyCommand(
        type = json.getString("type"),
        intValue = json.optInt("intValue", 0),
        stringValue = json.optString("stringValue", ""),
        ts = json.optLong("ts", 0),
    )
}

/**
 * Encodes a SET_APP_SCHEDULE payload: `{ "pkg": "...", "windows": [ ... ] }`.
 * Windows reuse the same shape as [windowsToJson].
 */
fun appSchedulePayload(pkg: String, windows: List<uk.co.cyberheroez.oroq.monitor.Window>): String =
    JSONObject()
        .put("pkg", pkg)
        .put("windows", org.json.JSONArray(uk.co.cyberheroez.oroq.monitor.windowsToJson(windows)))
        .toString()

/** Parses a SET_APP_SCHEDULE payload back into (package, windows). */
fun parseAppSchedulePayload(text: String): Pair<String, List<uk.co.cyberheroez.oroq.monitor.Window>> {
    val o = JSONObject(text)
    val windows = uk.co.cyberheroez.oroq.monitor.windowsFromJson(
        o.optJSONArray("windows")?.toString() ?: "[]",
    )
    return o.getString("pkg") to windows
}
