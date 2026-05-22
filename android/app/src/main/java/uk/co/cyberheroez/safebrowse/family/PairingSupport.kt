package uk.co.cyberheroez.safebrowse.family

/** Cleans a typed pairing code: removes spaces/hyphens and uppercases it. */
fun normalizeCode(raw: String): String =
    raw.filterNot { it == ' ' || it == '-' }.uppercase()
