export const KOTLIN_FILES: { path: string; body: string }[] = [
  {
    path: "model/RiskLevel.kt",
    body: `package com.aiphone.runtime.policy.model

enum class RiskLevel {
    LEVEL_1_READ,        // Auto-allow
    LEVEL_2_PREPARE,     // Auto-allow local state creation
    LEVEL_3_ACT,         // Requires explicit user UI card confirmation
    LEVEL_4_RESTRICTED   // Requires Biometric Auth + PIN step-up
}`,
  },
  {
    path: "model/CapabilityRequest.kt",
    body: `package com.aiphone.runtime.policy.model

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class CapabilityRequest(
    val requestId: String,
    val planId: String,
    val capabilityId: String,
    val toolName: String,
    val riskLevel: RiskLevel,
    val userQuery: String,
    val parameters: Map<String, Any?>,
    val humanReadableSummary: String,
    val signature: String? = null
)`,
  },
  {
    path: "model/PolicyResult.kt",
    body: `package com.aiphone.runtime.policy.model

sealed class PolicyResult {
    data class Success(val output: Any?, val receiptId: String) : PolicyResult()
    data class Denied(val reason: String) : PolicyResult()
    object CancelledByUser : PolicyResult()
    data class ExecutionError(val message: String, val cause: Throwable? = null) : PolicyResult()
}`,
  },
  {
    path: "security/HardwareKeyStoreSigner.kt",
    body: `package com.aiphone.runtime.policy.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature

class HardwareKeyStoreSigner {

    private val keyAlias = "AIPHONE_HARDWARE_AUDIT_KEY"
    private val keyStore: KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    init {
        if (!keyStore.containsAlias(keyAlias)) {
            generateHardwareKey()
        }
    }

    private fun generateHardwareKey() {
        val keyPairGenerator = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_RSA,
            "AndroidKeyStore"
        )
        val spec = KeyGenParameterSpec.Builder(
            keyAlias,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
        )
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setSignaturePaddings(KeyProperties.SIGNATURE_PADDING_RSA_PKCS1)
            .setKeySize(2048)
            .setIsStrongBoxBacked(true) // Enforces hardware HSM execution on Pixel hardware
            .build()

        keyPairGenerator.initialize(spec)
        keyPairGenerator.generateKeyPair()
    }

    fun signData(payload: String): String {
        val entry = keyStore.getEntry(keyAlias, null) as KeyStore.PrivateKeyEntry
        val privateKey: PrivateKey = entry.privateKey

        val signer = Signature.getInstance("SHA256withRSA")
        signer.initSign(privateKey)
        signer.update(payload.toByteArray(Charsets.UTF_8))

        val signatureBytes = signer.sign()
        return Base64.encodeToString(signatureBytes, Base64.NO_WRAP)
    }
}`,
  },
  {
    path: "security/BiometricAuthPrompt.kt",
    body: `package com.aiphone.runtime.policy.security

import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

class BiometricAuthPrompt(private val activity: FragmentActivity) {

    suspend fun authenticate(title: String, subtitle: String): Boolean = suspendCoroutine { continuation ->
        val executor = ContextCompat.getMainExecutor(activity)
        val biometricPrompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    continuation.resume(true)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    continuation.resume(false)
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    // Biometric failed; prompt continues listening until explicit cancel
                }
            }
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(BIOMETRIC_STRONG)
            .build()

        biometricPrompt.authenticate(promptInfo)
    }
}`,
  },
  {
    path: "storage/ReceiptEntity.kt",
    body: `package com.aiphone.runtime.policy.storage

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "audit_receipts")
data class ReceiptEntity(
    @PrimaryKey val receiptId: String,
    val timestamp: Long,
    val planId: String,
    val capabilityId: String,
    val toolName: String,
    val riskLevel: String,
    val userQuery: String,
    val executionStatus: String,
    val detailsJson: String,
    val cryptographicSignature: String
)`,
  },
  {
    path: "storage/ReceiptDao.kt",
    body: `package com.aiphone.runtime.policy.storage

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface ReceiptDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertReceipt(receipt: ReceiptEntity)

    @Query("SELECT * FROM audit_receipts ORDER BY timestamp DESC")
    suspend fun getAllReceipts(): List<ReceiptEntity>
}`,
  },
  {
    path: "storage/AppDatabase.kt",
    body: `package com.aiphone.runtime.policy.storage

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [ReceiptEntity::class], version = 1, exportSchema = true)
abstract class AppDatabase : RoomDatabase() {
    abstract fun receiptDao(): ReceiptDao
}`,
  },
  {
    path: "ui/PolicyConfirmationDialog.kt",
    body: `package com.aiphone.runtime.policy.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aiphone.runtime.policy.model.CapabilityRequest

@Composable
fun PolicyConfirmationCard(
    request: CapabilityRequest,
    onConfirm: () -> Unit,
    onDeny: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(20.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("POLICY APPROVAL REQUIRED", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFFD97706))
                Text(request.riskLevel.name, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(12.dp))
            Text(
                text = request.capabilityId.substringAfterLast('.').uppercase(),
                fontSize = 18.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(Modifier.height(8.dp))
            Text(request.humanReadableSummary, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(16.dp))
            Box(
                modifier = Modifier.fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(8.dp))
                    .padding(12.dp)
            ) {
                Column {
                    Text("Requested Action:", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Color.Gray)
                    Text(
                        text = "\${request.toolName}(\${request.parameters})",
                        fontSize = 12.sp, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
            Spacer(Modifier.height(20.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onDeny) { Text("Reject", color = MaterialTheme.colorScheme.error) }
                Spacer(Modifier.width(8.dp))
                Button(onClick = onConfirm) { Text("Confirm Execution") }
            }
        }
    }
}`,
  },
  {
    path: "ui/ConfirmationViewModel.kt",
    body: `package com.aiphone.runtime.policy.ui

import androidx.lifecycle.ViewModel
import com.aiphone.runtime.policy.model.CapabilityRequest
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Bridges the suspend-style confirmationCallback to the Compose confirmation card. */
class ConfirmationViewModel : ViewModel() {
    private val _pending = MutableStateFlow<CapabilityRequest?>(null)
    val pending: StateFlow<CapabilityRequest?> = _pending
    private var deferred: CompletableDeferred<Boolean>? = null

    suspend fun requestConfirmation(request: CapabilityRequest): Boolean {
        val d = CompletableDeferred<Boolean>()
        deferred = d
        _pending.value = request
        return try { d.await() } finally { _pending.value = null; deferred = null }
    }

    fun confirm() { deferred?.complete(true) }
    fun deny() { deferred?.complete(false) }
}`,
  },
  {
    path: "AuditLogger.kt",
    body: `package com.aiphone.runtime.policy

import com.aiphone.runtime.policy.model.CapabilityRequest
import com.aiphone.runtime.policy.security.HardwareKeyStoreSigner
import com.aiphone.runtime.policy.storage.ReceiptDao
import com.aiphone.runtime.policy.storage.ReceiptEntity
import com.squareup.moshi.Moshi
import java.util.UUID

class AuditLogger(
    private val receiptDao: ReceiptDao,
    private val signer: HardwareKeyStoreSigner,
    private val moshi: Moshi = Moshi.Builder().build()
) {
    suspend fun log(request: CapabilityRequest, status: String, output: Any?): String {
        val receiptId = "rcpt_" + UUID.randomUUID().toString()
        val timestamp = System.currentTimeMillis()
        val detailsJson = moshi.adapter(Any::class.java).toJson(
            mapOf("request" to request, "status" to status, "output" to output)
        )
        // Sign a canonical payload via the hardware-backed key
        val signaturePayload = "\$receiptId|\$timestamp|\${request.capabilityId}|\${request.toolName}|\$status"
        val signature = signer.signData(signaturePayload)

        receiptDao.insertReceipt(
            ReceiptEntity(
                receiptId = receiptId,
                timestamp = timestamp,
                planId = request.planId,
                capabilityId = request.capabilityId,
                toolName = request.toolName,
                riskLevel = request.riskLevel.name,
                userQuery = request.userQuery,
                executionStatus = status,
                detailsJson = detailsJson,
                cryptographicSignature = signature
            )
        )
        return receiptId
    }
}`,
  },
  {
    path: "PolicyBroker.kt",
    body: `package com.aiphone.runtime.policy

import com.aiphone.runtime.policy.model.*
import com.aiphone.runtime.policy.security.BiometricAuthPrompt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class PolicyBroker(
    private val auditLogger: AuditLogger,
    private val biometricAuthPrompt: BiometricAuthPrompt,
    private val confirmationCallback: suspend (CapabilityRequest) -> Boolean
) {
    suspend fun execute(
        request: CapabilityRequest,
        executor: suspend () -> Any?
    ): PolicyResult = withContext(Dispatchers.IO) {

        // Phase 1 gate verification — deterministic, never model-controlled
        when (request.riskLevel) {
            RiskLevel.LEVEL_1_READ, RiskLevel.LEVEL_2_PREPARE -> {
                // Auto-approved for read and local preparation
            }
            RiskLevel.LEVEL_3_ACT -> {
                val userApproved = confirmationCallback(request)
                if (!userApproved) {
                    auditLogger.log(request, "CANCELLED_BY_USER", null)
                    return@withContext PolicyResult.CancelledByUser
                }
            }
            RiskLevel.LEVEL_4_RESTRICTED -> {
                val authenticated = biometricAuthPrompt.authenticate(
                    title = "Biometric Verification Required",
                    subtitle = request.humanReadableSummary
                )
                if (!authenticated) {
                    auditLogger.log(request, "DENIED_BIOMETRIC_FAILED", null)
                    return@withContext PolicyResult.Denied("Biometric step-up authentication failed.")
                }
            }
        }

        // Execute target capability tool via strict adapter
        return@withContext try {
            val result = executor()
            val receiptId = auditLogger.log(request, "COMPLETED", result)
            PolicyResult.Success(output = result, receiptId = receiptId)
        } catch (e: Exception) {
            auditLogger.log(request, "FAILED_EXECUTION", mapOf("error" to e.localizedMessage))
            PolicyResult.ExecutionError(e.localizedMessage ?: "Unknown tool execution failure", e)
        }
    }
}`,
  },
];
