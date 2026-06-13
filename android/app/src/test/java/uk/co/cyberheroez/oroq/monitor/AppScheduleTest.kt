package uk.co.cyberheroez.oroq.monitor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek

class AppScheduleTest {

    private val mon = DayOfWeek.MONDAY
    private val tue = DayOfWeek.TUESDAY
    private val allDays = DayOfWeek.values().toSet()

    // Same-day window 09:00–17:00 (540..1020), every day.
    private val daytime = Window(540, 1020, allDays)
    // Overnight curfew 21:00–07:00 (1260..420), every day.
    private val curfew = Window(1260, 420, allDays)

    @Test fun insideSameDayWindowIsBlocked() {
        assertTrue(isBlockedNow(listOf(daytime), nowMinute = 600, today = mon))
    }

    @Test fun startMinuteIsInclusive() {
        assertTrue(isBlockedNow(listOf(daytime), nowMinute = 540, today = mon))
    }

    @Test fun endMinuteIsExclusive() {
        assertFalse(isBlockedNow(listOf(daytime), nowMinute = 1020, today = mon))
    }

    @Test fun outsideSameDayWindowIsAllowed() {
        assertFalse(isBlockedNow(listOf(daytime), nowMinute = 1100, today = mon))
    }

    @Test fun dayNotInSetIsAllowed() {
        val mondayOnly = Window(540, 1020, setOf(mon))
        assertFalse(isBlockedNow(listOf(mondayOnly), nowMinute = 600, today = tue))
    }

    @Test fun overnightEveningPortionBlocksOnStartDay() {
        // 22:00 Monday → inside the evening half of Monday's curfew.
        assertTrue(isBlockedNow(listOf(curfew), nowMinute = 1320, today = mon))
    }

    @Test fun overnightMorningPortionBelongsToPreviousDay() {
        // 06:00 Tuesday → still inside Monday's curfew that wrapped past midnight.
        assertTrue(isBlockedNow(listOf(curfew), nowMinute = 360, today = tue))
    }

    @Test fun overnightMorningBlockedOnlyIfPreviousDayInSet() {
        // Curfew runs Monday nights only. 06:00 Tuesday is the tail of Monday's
        // window, so it blocks; 06:00 Wednesday (tail of Tuesday, not in set) does not.
        val monNight = Window(1260, 420, setOf(mon))
        assertTrue(isBlockedNow(listOf(monNight), nowMinute = 360, today = tue))
        assertFalse(isBlockedNow(listOf(monNight), nowMinute = 360, today = DayOfWeek.WEDNESDAY))
    }

    @Test fun emptyWindowsNeverBlocks() {
        assertFalse(isBlockedNow(emptyList(), nowMinute = 600, today = mon))
    }

    @Test fun anyMatchingWindowBlocks() {
        assertTrue(isBlockedNow(listOf(daytime, curfew), nowMinute = 1320, today = mon))
    }

    @Test fun windowsJsonRoundTrip() {
        val windows = listOf(
            Window(540, 1020, setOf(mon, tue)),
            Window(1260, 420, allDays),
        )
        val restored = windowsFromJson(windowsToJson(windows))
        assertEquals(windows, restored)
    }

    @Test fun schedulesMapRoundTrip() {
        val map = mapOf(
            "com.tiktok" to listOf(Window(1260, 420, allDays)),
            "com.game" to listOf(Window(960, 1080, setOf(mon))),
        )
        val restored = schedulesFromJson(schedulesToJson(map))
        assertEquals(map, restored)
    }

    @Test fun emptySchedulesMapRoundTrip() {
        assertEquals(emptyMap<String, List<Window>>(), schedulesFromJson(schedulesToJson(emptyMap())))
    }

    @Test fun malformedScheduleJsonIsEmpty() {
        assertEquals(emptyMap<String, List<Window>>(), schedulesFromJson("not json"))
    }
}
