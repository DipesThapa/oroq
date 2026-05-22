package uk.co.cyberheroez.safebrowse.family

import org.json.JSONObject

/**
 * A remote-control instruction from the parent. [type] is one of the constants
 * below; [intValue] is its single integer argument (minutes).
 */
data class FamilyCommand(val type: String, val intValue: Int) {
    fun toJson(): String =
        JSONObject().put("type", type).put("intValue", intValue).toString()

    companion object {
        /** Add bonus screen-time minutes for today. */
        const val GRANT_EXTRA_TIME = "grant_extra_time"

        /** Set the daily screen-time limit, in minutes (0 = no limit). */
        const val SET_DAILY_LIMIT = "set_daily_limit"
    }
}

/** Parses a command from its JSON wire form. */
fun parseCommand(text: String): FamilyCommand {
    val json = JSONObject(text)
    return FamilyCommand(json.getString("type"), json.getInt("intValue"))
}
