package uk.co.cyberheroez.oroq.family

/** Base URL of the deployed Family Link Worker. */
const val WORKER_BASE_URL = "https://oroq-family.cyberheroez.workers.dev"

/** OAuth *web* client id from the `oroq` Google Cloud project. Public, not a
 *  secret. Blank until the owner mints it — the sign-in button hides itself. */
const val GOOGLE_WEB_CLIENT_ID = ""

/** A FamilyApi bound to the production Worker over real HTTP. */
fun familyApi(): FamilyApi = FamilyApi(WORKER_BASE_URL, HttpUrlTransport())
