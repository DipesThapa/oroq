package uk.co.cyberheroez.safebrowse.family

/** A single user-installed app on the child phone, as seen by the parent. */
data class InstalledApp(val packageName: String, val label: String)
