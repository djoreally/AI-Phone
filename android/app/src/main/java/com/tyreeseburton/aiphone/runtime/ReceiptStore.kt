package com.tyreeseburton.aiphone.runtime

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.util.UUID

class ReceiptStore(private val context: Context, private val signer: ReceiptSigner) {
    fun record(capability: String, tool: String, decision: String, outcome: String, target: String, detail: String): File {
        val payload = JSONObject()
            .put("uid", UUID.randomUUID().toString())
            .put("createdAt", Instant.now().toString())
            .put("capability", capability)
            .put("tool", tool)
            .put("decision", decision)
            .put("outcome", outcome)
            .put("target", target)
            .put("detail", detail)
            .put("keyFingerprint", signer.fingerprint())
        val canonical = payload.toString().toByteArray(Charsets.UTF_8)
        payload.put("signature", signer.sign(canonical))
        payload.put("signatureAlgorithm", "SHA256withECDSA")
        val dir = File(context.filesDir, "receipts").apply { mkdirs() }
        return File(dir, "${payload.getString("uid")}.json").apply { writeText(payload.toString(2)) }
    }
}
