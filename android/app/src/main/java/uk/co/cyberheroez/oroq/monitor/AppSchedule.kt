package uk.co.cyberheroez.oroq.monitor

import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek

/**
 * A blocked time window for one app. [startMinute]/[endMinute] are minutes
 * since local midnight (0..1439). A window where start < end is same-day; a
 * window where start > end wraps past midnight (overnight curfew) and its
 * morning tail belongs to the day it started on. [days] is the set of weekdays
 * the window's *start* falls on (default callers use all 7 = "every day").
 * start == end is treated as an empty window (never blocks).
 */
data class Window(
    val startMinute: Int,
    val endMinute: Int,
    val days: Set<DayOfWeek>,
)

/**
 * True if [nowMinute] on weekday [today] falls inside any of [windows].
 * start is inclusive, end is exclusive. Overnight windows are split into an
 * evening half (on the start day) and a morning half (which belongs to the
 * previous day's window).
 */
fun isBlockedNow(windows: List<Window>, nowMinute: Int, today: DayOfWeek): Boolean {
    for (w in windows) {
        when {
            w.startMinute < w.endMinute -> {
                if (today in w.days && nowMinute >= w.startMinute && nowMinute < w.endMinute) return true
            }
            w.startMinute > w.endMinute -> {
                // Evening half on the start day.
                if (today in w.days && nowMinute >= w.startMinute) return true
                // Morning half belongs to the previous day's window.
                if (today.minus(1) in w.days && nowMinute < w.endMinute) return true
            }
            // start == end → empty window, never blocks.
        }
    }
    return false
}

/** One app's windows → JSON array of {s,e,days:[1..7]} (days are DayOfWeek.value). */
fun windowsToJson(windows: List<Window>): String {
    val arr = JSONArray()
    for (w in windows) {
        val days = JSONArray()
        for (d in w.days.sortedBy { it.value }) days.put(d.value)
        arr.put(JSONObject().put("s", w.startMinute).put("e", w.endMinute).put("days", days))
    }
    return arr.toString()
}

fun windowsFromJson(text: String): List<Window> = runCatching {
    val arr = JSONArray(text)
    val out = ArrayList<Window>(arr.length())
    for (i in 0 until arr.length()) {
        val o = arr.getJSONObject(i)
        val daysArr = o.getJSONArray("days")
        val days = HashSet<DayOfWeek>(daysArr.length())
        for (j in 0 until daysArr.length()) days.add(DayOfWeek.of(daysArr.getInt(j)))
        out.add(Window(o.getInt("s"), o.getInt("e"), days))
    }
    out.toList()
}.getOrDefault(emptyList())

/** Full schedules map → JSON object { "pkg": [windows] }. */
fun schedulesToJson(schedules: Map<String, List<Window>>): String {
    val obj = JSONObject()
    for ((pkg, windows) in schedules) obj.put(pkg, JSONArray(windowsToJson(windows)))
    return obj.toString()
}

fun schedulesFromJson(text: String): Map<String, List<Window>> = runCatching {
    val obj = JSONObject(text)
    val out = HashMap<String, List<Window>>()
    for (key in obj.keys()) {
        val windows = windowsFromJson(obj.getJSONArray(key).toString())
        if (windows.isNotEmpty()) out[key] = windows
    }
    out.toMap()
}.getOrDefault(emptyMap())
