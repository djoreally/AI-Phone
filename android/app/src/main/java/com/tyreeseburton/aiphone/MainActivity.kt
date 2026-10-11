package com.tyreeseburton.aiphone

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.tyreeseburton.aiphone.capabilities.SmsCapability
import com.tyreeseburton.aiphone.runtime.Decision
import com.tyreeseburton.aiphone.runtime.DeviceTransport
import com.tyreeseburton.aiphone.runtime.PolicyEngine
import com.tyreeseburton.aiphone.runtime.ReceiptArtifact
import com.tyreeseburton.aiphone.runtime.ReceiptSigner
import com.tyreeseburton.aiphone.runtime.ReceiptStore
import org.json.JSONObject

class MainActivity : Activity() {
    private val sms = SmsCapability()
    private val signer = ReceiptSigner()
    private lateinit var receipts: ReceiptStore
    private lateinit var serverInput: EditText
    private lateinit var deviceIdInput: EditText
    private lateinit var tokenInput: EditText
    private lateinit var phoneInput: EditText
    private lateinit var messageInput: EditText
    private var pendingTarget = ""
    private var pendingMessage = ""
    private var pendingCommandId: Int? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        receipts = ReceiptStore(this, signer)
        val prefs = getSharedPreferences("runtime", MODE_PRIVATE)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(48, 72, 48, 48)
        }
        root.addView(TextView(this).apply { text = "AI Phone Runtime v0.2"; textSize = 24f })
        root.addView(TextView(this).apply {
            text = "Physical handset enrolled to the control plane. Policy before action. Verified receipt after action."
            textSize = 15f
        })

        serverInput = EditText(this).apply { hint = "https://your-ai-phone-host"; setText(prefs.getString("server", "")) }
        deviceIdInput = EditText(this).apply { hint = "Device ID"; inputType = android.text.InputType.TYPE_CLASS_NUMBER; setText(prefs.getString("deviceId", "")) }
        tokenInput = EditText(this).apply { hint = "Runtime enrollment token"; setText(prefs.getString("token", "")) }
        root.addView(serverInput, LinearLayout.LayoutParams(-1, -2))
        root.addView(deviceIdInput, LinearLayout.LayoutParams(-1, -2))
        root.addView(tokenInput, LinearLayout.LayoutParams(-1, -2))
        root.addView(Button(this).apply {
            text = "Enroll this phone"
            setOnClickListener { enrollPhone() }
        }, LinearLayout.LayoutParams(-1, -2))
        root.addView(Button(this).apply {
            text = "Poll control plane"
            setOnClickListener { pollCommand() }
        }, LinearLayout.LayoutParams(-1, -2))

        phoneInput = EditText(this).apply { hint = "Phone number"; inputType = android.text.InputType.TYPE_CLASS_PHONE }
        messageInput = EditText(this).apply { hint = "Message"; minLines = 3 }
        root.addView(phoneInput, LinearLayout.LayoutParams(-1, -2))
        root.addView(messageInput, LinearLayout.LayoutParams(-1, -2))
        root.addView(Button(this).apply {
            text = "Policy-check & send SMS"
            setOnClickListener { requestSms(null) }
        }, LinearLayout.LayoutParams(-1, -2))
        setContentView(root)
    }

    private fun transport(): DeviceTransport {
        val server = serverInput.text.toString().trim()
        val deviceId = deviceIdInput.text.toString().trim().toIntOrNull() ?: error("Device ID is required")
        val token = tokenInput.text.toString().trim()
        require(server.startsWith("https://")) { "Control-plane URL must use HTTPS" }
        require(token.isNotBlank()) { "Runtime token is required" }
        getSharedPreferences("runtime", MODE_PRIVATE).edit()
            .putString("server", server).putString("deviceId", deviceId.toString()).putString("token", token).apply()
        return DeviceTransport(server, deviceId, token)
    }

    private fun enrollPhone() {
        Thread {
            try {
                val response = transport().enroll(signer)
                runOnUiThread { toast("Enrolled device ${response.optInt("deviceId")}. Runtime ready.") }
            } catch (e: Exception) {
                runOnUiThread { toast("Enrollment failed: ${e.message}") }
            }
        }.start()
    }

    private fun pollCommand() {
        Thread {
            try {
                val command = transport().poll()
                if (command == null) {
                    runOnUiThread { toast("No queued command") }
                    return@Thread
                }
                runOnUiThread { handleCommand(command) }
            } catch (e: Exception) {
                runOnUiThread { toast("Poll failed: ${e.message}") }
            }
        }.start()
    }

    private fun handleCommand(command: JSONObject) {
        val capability = command.optString("capability")
        val tool = command.optString("tool")
        if (capability != "android.sms" || tool != "send_sms") {
            toast("Unsupported command: $capability:$tool")
            return
        }
        val payload = command.optJSONObject("payload") ?: JSONObject()
        phoneInput.setText(payload.optString("target"))
        messageInput.setText(payload.optString("message"))
        requestSms(command.optInt("id"))
    }

    private fun requestSms(commandId: Int?) {
        val target = phoneInput.text.toString().trim()
        val message = messageInput.text.toString().trim()
        val verdict = PolicyEngine.evaluate("android.sms", "send_sms")
        when (verdict.decision) {
            Decision.DENY -> finishWithReceipt(commandId, "deny", "blocked", target, verdict.reason)
            Decision.ALLOW -> ensurePermissionThenSend(target, message, commandId)
            Decision.CONFIRM -> AlertDialog.Builder(this)
                .setTitle("Level ${verdict.level} confirmation")
                .setMessage("Send this SMS to $target?\n\n$message\n\n${verdict.reason}")
                .setNegativeButton("Cancel") { _, _ -> finishWithReceipt(commandId, "confirm", "cancelled", target, "User cancelled before execution") }
                .setPositiveButton("Send") { _, _ -> ensurePermissionThenSend(target, message, commandId) }
                .show()
        }
    }

    private fun ensurePermissionThenSend(target: String, message: String, commandId: Int?) {
        if (checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED) {
            executeSms(target, message, commandId)
            return
        }
        pendingTarget = target
        pendingMessage = message
        pendingCommandId = commandId
        requestPermissions(arrayOf(Manifest.permission.SEND_SMS), SMS_PERMISSION_REQUEST)
    }

    private fun executeSms(target: String, message: String, commandId: Int?) {
        try {
            sms.send(target, message)
            val artifact = receipts.record("android.sms", "send_sms", "confirm", "success", target, "SMS handed to Android telephony stack")
            uploadReceipt(commandId, artifact)
            toast("SMS executed. Signed receipt: ${artifact.file.name}")
        } catch (e: Exception) {
            finishWithReceipt(commandId, "confirm", "failed", target, e.message ?: "Unknown SMS failure")
        }
    }

    private fun finishWithReceipt(commandId: Int?, decision: String, outcome: String, target: String, detail: String) {
        val artifact = receipts.record("android.sms", "send_sms", decision, outcome, target, detail)
        uploadReceipt(commandId, artifact)
        toast(detail)
    }

    private fun uploadReceipt(commandId: Int?, artifact: ReceiptArtifact) {
        if (serverInput.text.toString().isBlank()) return
        Thread {
            try { transport().postReceipt(commandId, artifact) }
            catch (e: Exception) { runOnUiThread { toast("Receipt saved locally; upload failed: ${e.message}") } }
        }.start()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != SMS_PERMISSION_REQUEST) return
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            executeSms(pendingTarget, pendingMessage, pendingCommandId)
        } else {
            finishWithReceipt(pendingCommandId, "confirm", "blocked", pendingTarget, "SEND_SMS permission denied by user")
        }
        pendingTarget = ""
        pendingMessage = ""
        pendingCommandId = null
    }

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()

    companion object { private const val SMS_PERMISSION_REQUEST = 1001 }
}
