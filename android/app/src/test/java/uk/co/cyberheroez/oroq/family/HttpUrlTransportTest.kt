package uk.co.cyberheroez.oroq.family

import com.sun.net.httpserver.HttpServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.net.InetSocketAddress

class HttpUrlTransportTest {

    private lateinit var server: HttpServer
    private var port = 0

    @Before fun startServer() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/echo") { exchange ->
            val requestBody = exchange.requestBody.readBytes().decodeToString()
            val reply = """{"method":"${exchange.requestMethod}","got":"$requestBody"}"""
            val bytes = reply.toByteArray()
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.createContext("/missing") { exchange ->
            exchange.sendResponseHeaders(404, -1)
            exchange.close()
        }
        server.start()
        port = server.address.port
    }

    @After fun stopServer() {
        server.stop(0)
    }

    @Test fun postSendsBodyAndReadsResponse() {
        val res = HttpUrlTransport().request(
            "POST",
            "http://127.0.0.1:$port/echo",
            mapOf("content-type" to "application/json"),
            """{"hello":"world"}""",
        )
        assertEquals(200, res.status)
        assertTrue(res.body.contains("\"method\":\"POST\""))
        assertTrue(res.body.contains("hello"))
    }

    @Test fun getReadsResponse() {
        val res = HttpUrlTransport().request(
            "GET", "http://127.0.0.1:$port/echo", emptyMap(), null,
        )
        assertEquals(200, res.status)
        assertTrue(res.body.contains("\"method\":\"GET\""))
    }

    @Test fun reportsNon200Status() {
        val res = HttpUrlTransport().request(
            "GET", "http://127.0.0.1:$port/missing", emptyMap(), null,
        )
        assertEquals(404, res.status)
    }

    @Test fun returnsStatusZeroOnAnUnreachableHost() {
        // Port 9 (discard) is closed on the loopback interface — connection refused.
        val res = HttpUrlTransport(connectTimeoutMs = 500, readTimeoutMs = 500).request(
            "GET", "http://127.0.0.1:9/whatever", emptyMap(), null,
        )
        assertEquals(0, res.status)
    }
}
