package uk.co.cyberheroez.oroq.update

/**
 * Parses a manifest of `"<category> <version>"` lines into a category→version
 * map. Blank and malformed lines are ignored.
 */
fun parseManifest(text: String): Map<String, String> =
    text.lineSequence()
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .mapNotNull {
            val parts = it.split(Regex("\\s+"))
            if (parts.size == 2) parts[0] to parts[1] else null
        }
        .toMap()

/**
 * Returns the categories whose [remote] version differs from [local] — i.e.
 * the lists that need downloading (changed or newly added).
 */
fun planUpdate(local: Map<String, String>, remote: Map<String, String>): Set<String> =
    remote.filterKeys { local[it] != remote[it] }.keys
