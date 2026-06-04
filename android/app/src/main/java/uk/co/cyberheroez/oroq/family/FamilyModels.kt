package uk.co.cyberheroez.oroq.family

/** Result of `POST /pair/create`. */
data class CreatePairingResult(
    val pairingId: String,
    val code: String,
    val expiresInSec: Int,
)

/** Result of `POST /pair/join`. */
data class JoinPairingResult(
    val pairingId: String,
    val parentPublicKeyB64: String,
)

/** A pairing record from `GET /pair/:id`. */
data class PairingRecord(
    val pairingId: String,
    val childLabel: String?,
    val parentPublicKeyB64: String,
    val childPublicKeyB64: String?,
    val paired: Boolean,
)
