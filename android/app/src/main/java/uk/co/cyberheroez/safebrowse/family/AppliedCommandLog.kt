package uk.co.cyberheroez.safebrowse.family

import android.content.Context
import org.json.JSONArray
import java.io.File

/**
 * A bounded, file-backed record of command ids already applied on this device.
 * It makes re-delivery safe — a non-idempotent command (grant extra time) is
 * applied at most once even if the ack does not reach the server.
 */
class AppliedCommandLog(
    private val file: File,
    private val maxIds: Int = 100,
) {
    private val lock = Any()

    fun contains(id: String): Boolean = synchronized(lock) { read().contains(id) }

    fun markApplied(id: String) {
        synchronized(lock) {
            val ids = read().toMutableList()
            if (ids.contains(id)) return
            ids.add(id)
            while (ids.size > maxIds) ids.removeAt(0)
            write(ids)
        }
    }

    private fun read(): List<String> {
        if (!file.exists()) return emptyList()
        return runCatching {
            val array = JSONArray(file.readText())
            (0 until array.length()).map { array.getString(it) }
        }.getOrDefault(emptyList())
    }

    private fun write(ids: List<String>) {
        val array = JSONArray()
        for (id in ids) array.put(id)
        file.parentFile?.mkdirs()
        file.writeText(array.toString())
    }

    companion object {
        fun forContext(context: Context): AppliedCommandLog =
            AppliedCommandLog(File(context.applicationContext.filesDir, "applied_commands.json"))
    }
}
