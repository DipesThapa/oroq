package uk.co.cyberheroez.safebrowse.filter

import android.content.Context

/**
 * Parses the text of a bundled blocklist file into a set of domains.
 * One domain per line; blank lines and `#` comment lines are ignored.
 */
fun parseBlocklistText(text: String): Set<String> =
    text.lineSequence()
        .map { it.trim() }
        .filter { it.isNotEmpty() && !it.startsWith("#") }
        .toSet()

/**
 * Loads every bundled `blocklists/<category>.txt` asset into a
 * [BlocklistRepository]. For each category, an updated copy downloaded into
 * `filesDir/blocklists/` takes precedence over the bundled asset. The
 * `manifest.txt` file is not a category and is skipped.
 */
fun loadBlocklistRepository(context: Context): BlocklistRepository {
    val dir = "blocklists"
    val updatedDir = java.io.File(context.filesDir, dir)
    val categories = HashMap<String, Set<String>>()
    for (name in context.assets.list(dir).orEmpty()) {
        if (!name.endsWith(".txt") || name == "manifest.txt") continue
        val category = name.removeSuffix(".txt")
        val updatedFile = java.io.File(updatedDir, name)
        val text = if (updatedFile.exists()) {
            updatedFile.readText()
        } else {
            context.assets.open("$dir/$name").bufferedReader().use { it.readText() }
        }
        categories[category] = parseBlocklistText(text)
    }
    return BlocklistRepository(categories)
}
