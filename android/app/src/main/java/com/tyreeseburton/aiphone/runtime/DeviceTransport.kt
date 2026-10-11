package com.tyreeseburton.aiphone.runtime

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class DeviceTransport(
    baseUrl: String,
    private val deviceId: Int,
    private val token: String,
) {
    private val base = baseUrl.trimEnd('/')

    fun enroll(signer: ReceiptSigner): JSONObject {
        val body = JSONObject()
            .put("deviceId", deviceId)
            .put("publicKeyPem", signer.publicKeyPem())
            .put("keyFingerprint", signer.fingerprint())
        return request("POST", "/api/runtime/enroll", body)
    }

    fun poll(): JSONObject? {
        val response = request("GET", "/api/runtime/commands?deviceId=$deviceId", null)
        return response.optJSONObject("command")
    }

    fun postReceipt(commandId: Int?, artifact: ReceiptArtifact): JSONObject {
        val body = JSONObject()
            .put("deviceId", deviceId)
            .put("commandId", commandId ?: JSONObject.NULL)
            .put("payload", artifact.payload)
            .put("signature", artifact.signature)
        return request("POST", "/api/runtime/receipts", body)
    }

    private fun request(method: String, path: String, body: JSONObject?): JSONObject {
        val connection = URL("$base$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 10_000
            connection.readTimeout = 15_000
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Accept", "application/json")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body.toString()) }
            }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            if (code !in 200..299) throw IllegalStateException("HTTP $code: $text")
            return if (text.isBlank()) JSONObject() else JSONObject(text)
        } finally {
            connection.disconnect()
        }
    }
}
