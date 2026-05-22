package uk.co.cyberheroez.safebrowse.update

import android.content.Context
import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Downloads updated blocklists from the hosted site into the app's private
 * `filesDir/blocklists/`. Only categories whose version changed are fetched.
 */
class BlocklistUpdater(private val context: Context) {

    private val updatedDir = File(context.filesDir, "blocklists")

    /** Runs one update pass. Returns the number of category lists refreshed. */
    fun runUpdate(): Int {
        val remoteManifestText = httpGet("$BASE_URL/manifest.txt") ?: return 0
        val remote = parseManifest(remoteManifestText)
        val local = parseManifest(installedManifestText())
        val toUpdate = planUpdate(local, remote)
        if (toUpdate.isEmpty()) return 0

        updatedDir.mkdirs()
        var updated = 0
        for (category in toUpdate) {
            val body = httpGet("$BASE_URL/$category.txt")
            if (body == null) {
                // A partial failure: leave the manifest unwritten so the next
                // run retries. Already-written files are simply re-fetched.
                Log.w(TAG, "download failed for $category; will retry next run")
                return updated
            }
            File(updatedDir, "$category.txt").writeText(body)
            updated++
        }
        File(updatedDir, "manifest.txt").writeText(remoteManifestText)
        Log.i(TAG, "updated $updated category list(s)")
        return updated
    }

    /** The currently installed manifest — updated copy if present, else bundled. */
    private fun installedManifestText(): String {
        val updatedManifest = File(updatedDir, "manifest.txt")
        return if (updatedManifest.exists()) {
            updatedManifest.readText()
        } else {
            context.assets.open("blocklists/manifest.txt")
                .bufferedReader().use { it.readText() }
        }
    }

    private fun httpGet(url: String): String? = try {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = TIMEOUT_MS
        connection.readTimeout = TIMEOUT_MS
        try {
            if (connection.responseCode == 200) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                null
            }
        } finally {
            connection.disconnect()
        }
    } catch (e: Exception) {
        Log.w(TAG, "GET failed: $url", e)
        null
    }

    companion object {
        private const val TAG = "BlocklistUpdater"
        private const val TIMEOUT_MS = 15_000
        const val BASE_URL = "https://safebrowse-blocklists.pages.dev"
    }
}
