package uk.co.cyberheroez.oroq.family

import org.json.JSONArray
import org.json.JSONObject

/** A single HTTP response: status code and raw body text. */
data class HttpResponse(val status: Int, val body: String)

/** Performs a blocking HTTP request. Swapped for a fake in tests. */
interface HttpTransport {
    fun request(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: String?,
    ): HttpResponse
}

/**
 * Client for the Family Link Worker. All calls are blocking — callers run them
 * on a background dispatcher. A method returns null when the request fails or
 * the server rejects it; the caller decides how to surface that.
 */
class FamilyApi(
    private val baseUrl: String,
    private val transport: HttpTransport,
) {
    private val jsonHeaders = mapOf("content-type" to "application/json")

    /** Asks the Worker to email an OTP. Returns true on success. */
    fun authRequest(email: String): Boolean {
        val body = JSONObject().put("email", email).toString()
        return post("/auth/request", jsonHeaders, body).status == 200
    }

    /** Verifies the OTP; returns the session token, or null if rejected. */
    fun authVerify(email: String, otp: String): String? {
        val body = JSONObject().put("email", email).put("otp", otp).toString()
        val res = post("/auth/verify", jsonHeaders, body)
        if (res.status != 200) return null
        return JSONObject(res.body).optString("token").ifEmpty { null }
    }

    /** Exchanges a Google ID token for a session token, or null if rejected. */
    fun authGoogle(idToken: String, nonce: String): String? {
        val body = JSONObject().put("idToken", idToken).put("nonce", nonce).toString()
        val res = post("/auth/google", jsonHeaders, body)
        if (res.status != 200) return null
        return JSONObject(res.body).optString("token").ifEmpty { null }
    }

    /** Creates a pairing and returns its id + short code, or null on failure. */
    fun pairCreate(token: String, parentPublicKeyB64: String, childLabel: String?): CreatePairingResult? {
        val payload = JSONObject().put("parentPublicKey", parentPublicKeyB64)
        if (childLabel != null) payload.put("childLabel", childLabel)
        val headers = jsonHeaders + ("authorization" to "Bearer $token")
        val res = post("/pair/create", headers, payload.toString())
        if (res.status != 200) return null
        val json = JSONObject(res.body)
        return CreatePairingResult(
            pairingId = json.getString("pairingId"),
            code = json.getString("code"),
            expiresInSec = json.optInt("expiresInSec", 600),
        )
    }

    /** Joins a pairing with a code; returns the parent public key, or null on failure. */
    fun pairJoin(code: String, childPublicKeyB64: String): JoinPairingResult? {
        val body = JSONObject().put("code", code).put("childPublicKey", childPublicKeyB64).toString()
        val res = post("/pair/join", jsonHeaders, body)
        if (res.status != 200) return null
        val json = JSONObject(res.body)
        return JoinPairingResult(
            pairingId = json.getString("pairingId"),
            parentPublicKeyB64 = json.getString("parentPublicKey"),
        )
    }

    /** Parent: unpair — deletes the pairing and its server traces. True on success. */
    fun pairDelete(token: String, pairingId: String): Boolean {
        val headers = mapOf("authorization" to "Bearer $token")
        return transport.request("DELETE", "$baseUrl/pair/$pairingId", headers, null).status == 200
    }

    /** Fetches a pairing record, or null if it does not exist or the request fails. */
    fun pairGet(pairingId: String): PairingRecord? {
        val res = transport.request("GET", "$baseUrl/pair/$pairingId", emptyMap(), null)
        if (res.status != 200) return null
        val json = JSONObject(res.body)
        return PairingRecord(
            pairingId = json.getString("pairingId"),
            childLabel = json.optString("childLabel").ifEmpty { null },
            parentPublicKeyB64 = json.getString("parentPublicKey"),
            childPublicKeyB64 = json.optString("childPublicKey").ifEmpty { null },
            paired = json.optBoolean("paired", false),
        )
    }

    /** Uploads an encrypted summary blob for a pairing. Returns true on success. */
    fun syncUpload(pairingId: String, ciphertextB64: String): Boolean {
        val body = JSONObject().put("ciphertext", ciphertextB64).toString()
        return post("/sync/$pairingId", jsonHeaders, body).status == 200
    }

    /** Fetches the latest encrypted summary blob for a pairing, or null if none. */
    fun syncFetch(token: String, pairingId: String): String? {
        val headers = mapOf("authorization" to "Bearer $token")
        val res = transport.request("GET", "$baseUrl/sync/$pairingId", headers, null)
        if (res.status != 200) return null
        val value = JSONObject(res.body).optString("ciphertext")
        return value.ifEmpty { null }
    }

    /** Parent: enqueue an encrypted command for a pairing. Returns true on success. */
    fun cmdSend(token: String, pairingId: String, ciphertextB64: String): Boolean {
        val headers = jsonHeaders + ("authorization" to "Bearer $token")
        val body = JSONObject().put("ciphertext", ciphertextB64).toString()
        return post("/cmd/$pairingId", headers, body).status == 200
    }

    /** Child: fetch pending commands as (id, ciphertext) pairs, or null on failure. */
    fun cmdFetch(pairingId: String): List<Pair<String, String>>? {
        val res = transport.request("GET", "$baseUrl/cmd/$pairingId", emptyMap(), null)
        if (res.status != 200) return null
        val array = JSONObject(res.body).getJSONArray("commands")
        return (0 until array.length()).map { i ->
            val o = array.getJSONObject(i)
            o.getString("id") to o.getString("ciphertext")
        }
    }

    /** Child: acknowledge applied commands so the server drops them. */
    fun cmdAck(pairingId: String, ids: List<String>): Boolean {
        val array = JSONArray()
        for (id in ids) array.put(id)
        val body = JSONObject().put("ids", array).toString()
        return post("/cmd/$pairingId/ack", jsonHeaders, body).status == 200
    }

    private fun post(path: String, headers: Map<String, String>, body: String): HttpResponse =
        transport.request("POST", "$baseUrl$path", headers, body)
}
