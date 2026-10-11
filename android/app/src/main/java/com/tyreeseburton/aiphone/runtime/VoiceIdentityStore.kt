package com.tyreeseburton.aiphone.runtime

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class VoiceIdentityStore(private val context: Context) {
    data class Identity(
        val provider: String,
        val phoneNumber: String,
        val sipUsername: String,
        val sipPassword: String,
        val callerIdName: String,
    )

    private val prefs = context.getSharedPreferences("voice_identity", Context.MODE_PRIVATE)
    private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    fun save(json: JSONObject) {
        val password = json.getString("sipPassword")
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encrypted = cipher.doFinal(password.toByteArray(Charsets.UTF_8))
        prefs.edit()
            .putString("provider", json.getString("provider"))
            .putString("phoneNumber", json.getString("phoneNumber"))
            .putString("sipUsername", json.getString("sipUsername"))
            .putString("callerIdName", json.optString("callerIdName", "AI Phone"))
            .putString("secret", Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .apply()
    }

    fun load(): Identity? {
        val encrypted = prefs.getString("secret", null) ?: return null
        val iv = prefs.getString("iv", null) ?: return null
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            secretKey(),
            GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)),
        )
        val password = String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), Charsets.UTF_8)
        return Identity(
            provider = prefs.getString("provider", "telnyx") ?: "telnyx",
            phoneNumber = prefs.getString("phoneNumber", "") ?: "",
            sipUsername = prefs.getString("sipUsername", "") ?: "",
            sipPassword = password,
            callerIdName = prefs.getString("callerIdName", "AI Phone") ?: "AI Phone",
        )
    }

    private fun secretKey(): SecretKey {
        val existing = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
        if (existing != null) return existing
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build()
        )
        return generator.generateKey()
    }

    companion object { private const val KEY_ALIAS = "ai_phone_voice_identity_v1" }
}
