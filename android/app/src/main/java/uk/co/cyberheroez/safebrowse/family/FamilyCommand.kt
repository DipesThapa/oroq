package uk.co.cyberheroez.safebrowse.family

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
) {
    fun toJson(): String = JSONObject()
        .put("type", type)
        .put("intValue", intValue)
        .put("stringValue", stringValue)
        .toString()

    companion object {
        const val GRANT_EXTRA_TIME = "grant_extra_time"
        const val SET_DAILY_LIMIT = "set_daily_limit"
        const val SET_CATEGORIES = "set_categories"
        const val SET_BLOCKED_APPS = "set_blocked_apps"
    }
}

/** Parses a command from its JSON wire form. */
fun parseCommand(text: String): FamilyCommand {
    val json = JSONObject(text)
    return FamilyCommand(
        type = json.getString("type"),
        intValue = json.optInt("intValue", 0),
        stringValue = json.optString("stringValue", ""),
    )
}
