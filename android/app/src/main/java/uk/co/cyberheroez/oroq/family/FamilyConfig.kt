package uk.co.cyberheroez.oroq.family

/** Base URL of the deployed Family Link Worker. */
const val WORKER_BASE_URL = "https://oroq-family.cyberheroez.workers.dev"

/** A FamilyApi bound to the production Worker over real HTTP. */
fun familyApi(): FamilyApi = FamilyApi(WORKER_BASE_URL, HttpUrlTransport())
