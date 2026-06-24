package uk.co.cyberheroez.oroq.family

/** Result of `POST /pair/create` (called by the child). The [childToken] is the
 *  per-pairing bearer secret the child keeps and presents on /sync and /cmd. */
data class CreatePairingResult(
    val pairingId: String,
    val code: String,
    val childToken: String,
    val expiresInSec: Int,
)

/** Result of `POST /pair/join` (called by the parent): the child's public key. */
data class JoinPairingResult(
    val pairingId: String,
    val childPublicKeyB64: String,
)

/** A pairing record from `GET /pair/:id`. The parent key is null until they join. */
data class PairingRecord(
    val pairingId: String,
    val childLabel: String?,
    val parentPublicKeyB64: String?,
    val childPublicKeyB64: String?,
    val paired: Boolean,
)

/** Result of `GET /sync/:id`: the encrypted blob plus the server's receive time
 *  ([receivedAt] is null for legacy uploads stored before H2). */
data class FetchedSummary(
    val ciphertextB64: String,
    val receivedAt: Long?,
)
