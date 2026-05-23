package uk.co.cyberheroez.safebrowse.family

import org.junit.Assert.assertEquals
import org.junit.Test

class FamilyCommandTest {

    @Test fun grantExtraTimeRoundTrips() {
        val command = FamilyCommand(FamilyCommand.GRANT_EXTRA_TIME, intValue = 30)
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
}
