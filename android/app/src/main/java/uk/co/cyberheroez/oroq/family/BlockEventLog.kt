package uk.co.cyberheroez.oroq.family

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * A bounded, file-backed log of recent blocked attempts. Thread-safe — the VPN
 * service, the app monitor and the sync worker all touch it from one process.
 */
class BlockEventLog(
    private val file: File,
    private val maxEvents: Int = 50,
) {
    private val lock = Any()

    /** Appends an event (oldest events drop once [maxEvents] is exceeded). */
    fun record(type: String, label: String, cat: String? = null, at: Long = System.currentTimeMillis()) {
        synchronized(lock) {
            val events = readUnlocked().toMutableList()
            events.add(BlockEvent(at, type, label, cat))
            while (events.size > maxEvents) events.removeAt(0)
            writeUnlocked(events)
        }
    }

    /** The most recent [limit] events, newest first. */
    fun recent(limit: Int): List<BlockEvent> = synchronized(lock) {
        readUnlocked().asReversed().take(limit)
    }

    /** How many events of [type] occurred at or after [since]. */
    fun countSince(type: String, since: Long): Int = synchronized(lock) {
        readUnlocked().count { it.type == type && it.ts >= since }
    }

    private fun readUnlocked(): List<BlockEvent> {
        if (!file.exists()) return emptyList()
        return runCatching {
            val array = JSONArray(file.readText())
            (0 until array.length()).map { i ->
                val o = array.getJSONObject(i)
                BlockEvent(
                    o.getLong("ts"), o.getString("type"), o.getString("label"),
                    o.optString("cat").ifEmpty { null },
                )
            }
        }.getOrDefault(emptyList())
    }

    private fun writeUnlocked(events: List<BlockEvent>) {
        val array = JSONArray()
        for (e in events) {
            val o = JSONObject().put("ts", e.ts).put("type", e.type).put("label", e.label)
            if (e.cat != null) o.put("cat", e.cat)
            array.put(o)
        }
        file.parentFile?.mkdirs()
        file.writeText(array.toString())
    }

    companion object {
        /** The shared log for this app, stored in the app's private files dir. */
        fun forContext(context: Context): BlockEventLog =
            BlockEventLog(File(context.applicationContext.filesDir, "block_events.json"))
    }
}
