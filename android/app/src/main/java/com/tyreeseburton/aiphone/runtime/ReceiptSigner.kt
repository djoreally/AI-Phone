package com.tyreeseburton.aiphone.runtime

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature
import java.util.Base64

class ReceiptSigner {
    private val alias = "ai_phone_receipt_signing_v1"

    init { ensureKey() }

    private fun ensureKey() {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (ks.containsAlias(alias)) return
        val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
        val spec = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
        ).setDigests(KeyProperties.DIGEST_SHA256).build()
        generator.initialize(spec)
        generator.generateKeyPair()
    }

    fun fingerprint(): String {
        val encoded = publicKeyBytes()
        return MessageDigest.getInstance("SHA-256").digest(encoded)
            .joinToString(":") { "%02X".format(it) }
    }

    fun publicKeyPem(): String {
        val b64 = Base64.getMimeEncoder(64, "\n".toByteArray())
            .encodeToString(publicKeyBytes())
        return "-----BEGIN PUBLIC KEY-----\n$b64\n-----END PUBLIC KEY-----"
    }

    private fun publicKeyBytes(): ByteArray {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return ks.getCertificate(alias).publicKey.encoded
    }

    fun sign(payload: ByteArray): String {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val key = ks.getKey(alias, null) as java.security.PrivateKey
        val signature = Signature.getInstance("SHA256withECDSA")
        signature.initSign(key)
        signature.update(payload)
        return Base64.getEncoder().encodeToString(signature.sign())
    }
}
