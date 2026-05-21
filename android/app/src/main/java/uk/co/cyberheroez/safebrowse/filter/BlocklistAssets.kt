package uk.co.cyberheroez.safebrowse.filter

import android.content.res.AssetManager

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
 * Loads every `blocklists/<category>.txt` asset bundled in the APK into a
 * [BlocklistRepository]. The category name is the file name without `.txt`.
 */
fun loadBlocklistRepository(assets: AssetManager): BlocklistRepository {
    val dir = "blocklists"
    val categories = HashMap<String, Set<String>>()
    for (name in assets.list(dir).orEmpty()) {
        if (!name.endsWith(".txt")) continue
        val category = name.removeSuffix(".txt")
        val text = assets.open("$dir/$name").bufferedReader().use { it.readText() }
        categories[category] = parseBlocklistText(text)
    }
    return BlocklistRepository(categories)
}
