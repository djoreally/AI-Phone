package com.tyreeseburton.aiphone.runtime

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.util.UUID

data class ReceiptArtifact(
    val file: File,
    val payload: String,
    val signature: String,
)

class ReceiptStore(private val context: Context, private val signer: ReceiptSigner) {
    fun record(capability: String, tool: String, decision: String, outcome: String, target: String, detail: String): ReceiptArtifact {
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
        val canonical = payload.toString()
        val signature = signer.sign(canonical.toByteArray(Charsets.UTF_8))
        val envelope = JSONObject(payload.toString())
            .put("signature", signature)
            .put("signatureAlgorithm", "SHA256withECDSA")
        val dir = File(context.filesDir, "receipts").apply { mkdirs() }
        val file = File(dir, "${payload.getString("uid")}.json").apply { writeText(envelope.toString(2)) }
        return ReceiptArtifact(file, canonical, signature)
    }
}
