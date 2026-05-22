package uk.co.cyberheroez.safebrowse.family

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** An HttpTransport whose responses are scripted per "METHOD url". */
private class FakeTransport(
    private val responses: Map<String, HttpResponse>,
) : HttpTransport {
    val sent = mutableListOf<String>()
    override fun request(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: String?,
    ): HttpResponse {
        sent += "$method $url ${body ?: ""}"
        return responses["$method $url"] ?: HttpResponse(404, "")
    }
}

class FamilyApiTest {

    private val base = "https://api.test"

    @Test fun authRequestReturnsTrueOn200() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "POST $base/auth/request" to HttpResponse(200, """{"ok":true}"""),
        )))
        assertTrue(api.authRequest("parent@example.com"))
    }

    @Test fun authVerifyReturnsTheToken() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "POST $base/auth/verify" to HttpResponse(200, """{"token":"jwt-123"}"""),
        )))
        assertEquals("jwt-123", api.authVerify("parent@example.com", "654321"))
    }

    @Test fun authVerifyReturnsNullOnBadOtp() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "POST $base/auth/verify" to HttpResponse(401, """{"error":"bad_otp"}"""),
        )))
        assertNull(api.authVerify("parent@example.com", "000000"))
    }

    @Test fun pairCreateParsesTheCode() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "POST $base/pair/create" to HttpResponse(
                200, """{"pairingId":"pid-1","code":"ABCD2345","expiresInSec":600}""",
            ),
        )))
        val result = api.pairCreate("jwt-123", "PARENTKEY", "Tablet")
        assertEquals("pid-1", result?.pairingId)
        assertEquals("ABCD2345", result?.code)
    }

    @Test fun pairJoinParsesTheParentKey() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "POST $base/pair/join" to HttpResponse(
                200, """{"pairingId":"pid-1","parentPublicKey":"PARENTKEY"}""",
            ),
        )))
        val result = api.pairJoin("ABCD2345", "CHILDKEY")
        assertEquals("PARENTKEY", result?.parentPublicKeyB64)
    }

    @Test fun pairGetParsesTheRecord() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "GET $base/pair/pid-1" to HttpResponse(
                200,
                """{"pairingId":"pid-1","childLabel":"Tablet","parentPublicKey":"PK",""" +
                    """"childPublicKey":"CK","paired":true,"pairedAt":123}""",
            ),
        )))
        val record = api.pairGet("pid-1")
        assertEquals(true, record?.paired)
        assertEquals("CK", record?.childPublicKeyB64)
    }

    @Test fun pairGetReturnsNullWhenMissing() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "GET $base/pair/missing" to HttpResponse(404, """{"error":"not_found"}"""),
        )))
        assertNull(api.pairGet("missing"))
    }

    @Test fun pairCreateSendsTheBearerToken() {
        val transport = FakeTransport(mapOf(
            "POST $base/pair/create" to HttpResponse(
                200, """{"pairingId":"p","code":"ABCD2345","expiresInSec":600}""",
            ),
        ))
        FamilyApi(base, transport).pairCreate("jwt-xyz", "PK", null)
        assertTrue(transport.sent.any { it.contains("/pair/create") })
    }

    @Test fun syncFetchReturnsTheCiphertext() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "GET $base/sync/pid-1" to HttpResponse(200, """{"ciphertext":"BLOB"}"""),
        )))
        assertEquals("BLOB", api.syncFetch("jwt-123", "pid-1"))
    }

    @Test fun syncFetchReturnsNullWhenEmpty() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "GET $base/sync/pid-1" to HttpResponse(200, """{"ciphertext":null}"""),
        )))
        assertNull(api.syncFetch("jwt-123", "pid-1"))
    }

    @Test fun cmdSendReturnsTrueOn200() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "POST $base/cmd/pid-1" to HttpResponse(200, """{"id":"c1"}"""),
        )))
        assertTrue(api.cmdSend("jwt-1", "pid-1", "CIPHER"))
    }

    @Test fun cmdFetchParsesTheQueue() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "GET $base/cmd/pid-1" to HttpResponse(
                200, """{"commands":[{"id":"c1","ciphertext":"A"},{"id":"c2","ciphertext":"B"}]}""",
            ),
        )))
        val queue = api.cmdFetch("pid-1")
        assertEquals(2, queue?.size)
        assertEquals("c1", queue?.get(0)?.first)
        assertEquals("B", queue?.get(1)?.second)
    }

    @Test fun cmdAckReturnsTrueOn200() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "POST $base/cmd/pid-1/ack" to HttpResponse(200, """{"ok":true}"""),
        )))
        assertTrue(api.cmdAck("pid-1", listOf("c1", "c2")))
    }
}
