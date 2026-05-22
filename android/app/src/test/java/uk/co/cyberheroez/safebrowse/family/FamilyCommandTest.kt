package uk.co.cyberheroez.safebrowse.family

import org.junit.Assert.assertEquals
import org.junit.Test

class FamilyCommandTest {

    @Test fun grantExtraTimeRoundTrips() {
        val command = FamilyCommand(FamilyCommand.GRANT_EXTRA_TIME, 30)
        assertEquals(command, parseCommand(command.toJson()))
    }

    @Test fun setDailyLimitRoundTrips() {
        val command = FamilyCommand(FamilyCommand.SET_DAILY_LIMIT, 90)
        assertEquals(command, parseCommand(command.toJson()))
    }
}
