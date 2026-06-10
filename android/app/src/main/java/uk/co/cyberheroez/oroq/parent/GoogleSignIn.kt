package uk.co.cyberheroez.oroq.parent

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.family.GOOGLE_WEB_CLIENT_ID
import uk.co.cyberheroez.oroq.family.familyApi
import java.security.SecureRandom

/** Outcome of a sign-in attempt; [Cancelled] is silent, the rest show copy. */
sealed interface GoogleSignInResult {
    data class Success(val sessionToken: String) : GoogleSignInResult
    data object Cancelled : GoogleSignInResult
    data object Unavailable : GoogleSignInResult
    data object Rejected : GoogleSignInResult
}

object GoogleSignIn {
    /** False until the owner mints the OAuth client — the button hides itself. */
    val isConfigured: Boolean get() = GOOGLE_WEB_CLIENT_ID.isNotBlank()

    private fun newNonce(): String {
        val bytes = ByteArray(16).also { SecureRandom().nextBytes(it) }
        return android.util.Base64.encodeToString(
            bytes,
            android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING,
        )
    }

    /**
     * Runs the Credential Manager flow: returning parents resolve instantly
     * (authorized accounts + auto-select); first-timers get the account picker.
     */
    suspend fun signIn(context: Context): GoogleSignInResult {
        val nonce = newNonce()
        val manager = CredentialManager.create(context)
        val credential = try {
            try {
                manager.getCredential(context, request(nonce, onlyAuthorized = true)).credential
            } catch (_: NoCredentialException) {
                manager.getCredential(context, request(nonce, onlyAuthorized = false)).credential
            }
        } catch (_: GetCredentialCancellationException) {
            return GoogleSignInResult.Cancelled
        } catch (_: Exception) {
            return GoogleSignInResult.Unavailable
        }
        val idToken = runCatching {
            GoogleIdTokenCredential.createFrom(credential.data).idToken
        }.getOrNull() ?: return GoogleSignInResult.Unavailable
        val session = withContext(Dispatchers.IO) { familyApi().authGoogle(idToken, nonce) }
        return if (session != null) GoogleSignInResult.Success(session) else GoogleSignInResult.Rejected
    }

    private fun request(nonce: String, onlyAuthorized: Boolean): GetCredentialRequest =
        GetCredentialRequest.Builder()
            .addCredentialOption(
                GetGoogleIdOption.Builder()
                    .setServerClientId(GOOGLE_WEB_CLIENT_ID)
                    .setFilterByAuthorizedAccounts(onlyAuthorized)
                    .setAutoSelectEnabled(onlyAuthorized)
                    .setNonce(nonce)
                    .build(),
            )
            .build()
}
