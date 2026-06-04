package uk.co.cyberheroez.oroq.config

/** The web-content categories a parent can choose to block. */
object Categories {

    /** A blockable category. [id] matches a bundled `blocklists/<id>.txt`. */
    data class Category(val id: String, val label: String)

    /** Categories shown as toggles during onboarding and in settings. */
    val SELECTABLE = listOf(
        Category("adult", "Adult content"),
        Category("gambling", "Gambling"),
        Category("drugs", "Drugs"),
        Category("violence", "Violence"),
        Category("social", "Social media"),
        Category("gaming", "Gaming sites"),
        Category("malware", "Malware"),
        Category("phishing", "Phishing"),
    )

    /** Always enforced, never shown as a toggle (anti-DoH-bypass). */
    const val ALWAYS_ON = "doh"

    /** Default selection for a new install: every selectable category. */
    val DEFAULT_ENABLED: Set<String> = SELECTABLE.map { it.id }.toSet()
}
