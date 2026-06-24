package uk.co.cyberheroez.oroq.family

import org.junit.Assert.assertEquals
import org.junit.Test

class FamilyCommandTest {

    @Test fun grantExtraTimeRoundTrips() {
        val command = FamilyCommand(FamilyCommand.GRANT_EXTRA_TIME, intValue = 30)
        assertEquals(command, parseCommand(command.toJson()))
    }

    @Test fun timestampRoundTrips() {
        val command = FamilyCommand(FamilyCommand.SET_PROTECTION, intValue = 0, ts = 1_717_000_000_000)
        assertEquals(command, parseCommand(command.toJson()))
    }

    @Test fun setDailyLimitRoundTrips() {
        val command = FamilyCommand(FamilyCommand.SET_DAILY_LIMIT, intValue = 90)
        assertEquals(command, parseCommand(command.toJson()))
    }

    @Test fun setCategoriesRoundTripsWithStringValue() {
        val command = FamilyCommand(
            type = FamilyCommand.SET_CATEGORIES,
            stringValue = "adult,gambling",
        )
        assertEquals(command, parseCommand(command.toJson()))
    }

    @Test fun setCategoriesAllowsEmptyString() {
        val command = FamilyCommand(FamilyCommand.SET_CATEGORIES, stringValue = "")
        assertEquals(command, parseCommand(command.toJson()))
    }

    @Test fun legacyJsonWithoutStringValueStillParses() {
        // Old commands queued before this change have no stringValue field —
        // the parser must default it to "".
        val legacy = """{"type":"grant_extra_time","intValue":30}"""
        val parsed = parseCommand(legacy)
        assertEquals(FamilyCommand.GRANT_EXTRA_TIME, parsed.type)
        assertEquals(30, parsed.intValue)
        assertEquals("", parsed.stringValue)
    }

    @Test fun setBlockedAppsRoundTripsWithStringValue() {
        val command = FamilyCommand(
            type = FamilyCommand.SET_BLOCKED_APPS,
            stringValue = "com.instagram.android,com.zhiliaoapp.musically",
        )
        assertEquals(command, parseCommand(command.toJson()))
    }

    @Test fun setBlockedAppsAllowsEmptyString() {
        val command = FamilyCommand(FamilyCommand.SET_BLOCKED_APPS, stringValue = "")
        assertEquals(command, parseCommand(command.toJson()))
    }

    @Test fun appSchedulePayloadRoundTrip() {
        val windows = listOf(
            uk.co.cyberheroez.oroq.monitor.Window(
                1260, 420, java.time.DayOfWeek.values().toSet(),
            ),
        )
        val payload = appSchedulePayload("com.tiktok", windows)
        val (pkg, restored) = parseAppSchedulePayload(payload)
        assertEquals("com.tiktok", pkg)
        assertEquals(windows, restored)
    }

    @Test fun appScheduleEmptyWindowsRoundTrip() {
        val payload = appSchedulePayload("com.x", emptyList())
        val (pkg, restored) = parseAppSchedulePayload(payload)
        assertEquals("com.x", pkg)
        assertEquals(emptyList<uk.co.cyberheroez.oroq.monitor.Window>(), restored)
    }
}
