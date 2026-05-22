package uk.co.cyberheroez.safebrowse.family

/** Base URL of the deployed Family Link Worker. */
const val WORKER_BASE_URL = "https://safebrowse-family.<account>.workers.dev"

/** A FamilyApi bound to the production Worker over real HTTP. */
fun familyApi(): FamilyApi = FamilyApi(WORKER_BASE_URL, HttpUrlTransport())
