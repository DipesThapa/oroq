package uk.co.cyberheroez.oroq.family

/** An OroQ pairing code: 8 chars, letters/digits after normalisation. */
fun looksLikePairCode(text: String): Boolean {
    val t = normalizeCode(text)
    return t.length == 8 && t.all { it.isLetterOrDigit() }
}
