package uk.co.cyberheroez.oroq.monitor

import org.junit.Assert.assertTrue
import org.junit.Test

class SystemAppsTest {

    @Test fun includesOwnPackageAndStaticEssentials() {
        val set = systemCriticalPackages(home = null, dialer = null, ownPackage = "uk.co.cyberheroez.oroq")
        assertTrue("uk.co.cyberheroez.oroq" in set)
        assertTrue("com.android.settings" in set)
        assertTrue("com.android.systemui" in set)
        assertTrue("com.android.vending" in set) // Play Store
    }

    @Test fun includesResolvedHomeAndDialerWhenPresent() {
        val set = systemCriticalPackages(
            home = "com.vendor.launcher", dialer = "com.vendor.dialer",
            ownPackage = "uk.co.cyberheroez.oroq",
        )
        assertTrue("com.vendor.launcher" in set)
        assertTrue("com.vendor.dialer" in set)
    }
}
