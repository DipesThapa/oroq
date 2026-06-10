package uk.co.cyberheroez.oroq.family

import org.json.JSONArray
import org.json.JSONObject

/** One app's foreground time today. */
data class TopApp(val label: String, val minutes: Int)

/** A single blocked attempt — [type] is "web" or "app", [label] a domain or app
 *  name, [cat] the blocklist category that matched ("phishing", "malware",
 *  "adult", …) or null for app blocks and events from older children. */
data class BlockEvent(val ts: Long, val type: String, val label: String, val cat: String? = null)

/** The activity snapshot a child device sends to its parent. */
data class FamilySummary(
    val ts: Long,
    val protectionOn: Boolean,
    val screenTimeTodayMin: Int,
    val dailyLimitMin: Int,
    val topApps: List<TopApp> = emptyList(),
    val webBlockedToday: Int = 0,
    val appBlockedToday: Int = 0,
    val recentEvents: List<BlockEvent> = emptyList(),
    /** Category ids currently enabled (i.e. blocked) on the child. */
    val categories: Set<String> = emptySet(),
    /** Every user-installed app on the child phone — for the parent picker. */
    val installedApps: List<InstalledApp> = emptyList(),
    /** Package names the child currently blocks. Mirror of [installedApps] selection. */
    val blockedApps: Set<String> = emptySet(),
    /** Whether DNS-level Safe Search enforcement is on (parent toggle). */
    val safeSearchOn: Boolean = false,
    /** Whether DNS-level YouTube Restricted Mode is on (parent toggle). */
    val ytRestrictedOn: Boolean = false,
)

/** Serialises the summary to its compact JSON wire form. */
fun FamilySummary.toJson(): String {
    val apps = JSONArray()
    for (app in topApps) {
        apps.put(JSONObject().put("label", app.label).put("minutes", app.minutes))
    }
    val events = JSONArray()
    for (event in recentEvents) {
        val o = JSONObject().put("ts", event.ts).put("type", event.type).put("label", event.label)
        if (event.cat != null) o.put("cat", event.cat)
        events.put(o)
    }
    val cats = JSONArray()
    for (id in categories) cats.put(id)
    val installed = JSONArray()
    for (app in installedApps) {
        installed.put(JSONObject().put("pkg", app.packageName).put("label", app.label))
    }
    val blocked = JSONArray()
    for (pkg in blockedApps) blocked.put(pkg)
    return JSONObject()
        .put("ts", ts)
        .put("protectionOn", protectionOn)
        .put("screenTimeTodayMin", screenTimeTodayMin)
        .put("dailyLimitMin", dailyLimitMin)
        .put("webBlockedToday", webBlockedToday)
        .put("appBlockedToday", appBlockedToday)
        .put("topApps", apps)
        .put("recentEvents", events)
        .put("categories", cats)
        .put("installedApps", installed)
        .put("blockedApps", blocked)
        .put("safeSearchOn", safeSearchOn)
        .put("ytRestrictedOn", ytRestrictedOn)
        .toString()
}

/** Parses a summary from its JSON wire form. */
fun parseSummary(text: String): FamilySummary {
    val json = JSONObject(text)
    val apps = ArrayList<TopApp>()
    val appsArray = json.optJSONArray("topApps")
    if (appsArray != null) {
        for (i in 0 until appsArray.length()) {
            val o = appsArray.getJSONObject(i)
            apps.add(TopApp(o.getString("label"), o.getInt("minutes")))
        }
    }
    val events = ArrayList<BlockEvent>()
    val eventsArray = json.optJSONArray("recentEvents")
    if (eventsArray != null) {
        for (i in 0 until eventsArray.length()) {
            val o = eventsArray.getJSONObject(i)
            events.add(
                BlockEvent(
                    o.getLong("ts"), o.getString("type"), o.getString("label"),
                    o.optString("cat").ifEmpty { null },
                ),
            )
        }
    }
    val cats = HashSet<String>()
    val catsArray = json.optJSONArray("categories")
    if (catsArray != null) {
        for (i in 0 until catsArray.length()) cats.add(catsArray.getString(i))
    }
    val installed = ArrayList<InstalledApp>()
    val installedArray = json.optJSONArray("installedApps")
    if (installedArray != null) {
        for (i in 0 until installedArray.length()) {
            val o = installedArray.getJSONObject(i)
            installed.add(InstalledApp(o.getString("pkg"), o.getString("label")))
        }
    }
    val blocked = HashSet<String>()
    val blockedArray = json.optJSONArray("blockedApps")
    if (blockedArray != null) {
        for (i in 0 until blockedArray.length()) blocked.add(blockedArray.getString(i))
    }
    return FamilySummary(
        ts = json.getLong("ts"),
        protectionOn = json.getBoolean("protectionOn"),
        screenTimeTodayMin = json.getInt("screenTimeTodayMin"),
        dailyLimitMin = json.getInt("dailyLimitMin"),
        topApps = apps,
        webBlockedToday = json.getInt("webBlockedToday"),
        appBlockedToday = json.getInt("appBlockedToday"),
        recentEvents = events,
        categories = cats,
        installedApps = installed,
        blockedApps = blocked,
        safeSearchOn = json.optBoolean("safeSearchOn", false),
        ytRestrictedOn = json.optBoolean("ytRestrictedOn", false),
    )
}
