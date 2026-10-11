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
import com.tyreeseburton.aiphone.runtime.PolicyEngine
import com.tyreeseburton.aiphone.runtime.ReceiptSigner
import com.tyreeseburton.aiphone.runtime.ReceiptStore

class MainActivity : Activity() {
    private val sms = SmsCapability()
    private lateinit var receipts: ReceiptStore
    private lateinit var phoneInput: EditText
    private lateinit var messageInput: EditText
    private var pendingTarget = ""
    private var pendingMessage = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        receipts = ReceiptStore(this, ReceiptSigner())

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(48, 72, 48, 48)
        }
        root.addView(TextView(this).apply {
            text = "AI Phone Runtime v0.1"
            textSize = 24f
        })
        root.addView(TextView(this).apply {
            text = "Real Android execution. Policy before action. Signed receipt after action."
            textSize = 15f
        })
        phoneInput = EditText(this).apply {
            hint = "Phone number"
            inputType = android.text.InputType.TYPE_CLASS_PHONE
        }
        messageInput = EditText(this).apply {
            hint = "Message"
            minLines = 3
        }
        root.addView(phoneInput, LinearLayout.LayoutParams(-1, -2))
        root.addView(messageInput, LinearLayout.LayoutParams(-1, -2))
        root.addView(Button(this).apply {
            text = "Policy-check & send SMS"
            setOnClickListener { requestSms() }
        }, LinearLayout.LayoutParams(-1, -2))
        setContentView(root)
    }

    private fun requestSms() {
        val target = phoneInput.text.toString().trim()
        val message = messageInput.text.toString().trim()
        val verdict = PolicyEngine.evaluate("android.sms", "send_sms")

        when (verdict.decision) {
            Decision.DENY -> {
                receipts.record("android.sms", "send_sms", "deny", "blocked", target, verdict.reason)
                toast(verdict.reason)
            }
            Decision.ALLOW -> ensurePermissionThenSend(target, message)
            Decision.CONFIRM -> AlertDialog.Builder(this)
                .setTitle("Level ${verdict.level} confirmation")
                .setMessage("Send this SMS to $target?\n\n$message\n\n${verdict.reason}")
                .setNegativeButton("Cancel") { _, _ ->
                    receipts.record("android.sms", "send_sms", "confirm", "cancelled", target, "User cancelled before execution")
                }
                .setPositiveButton("Send") { _, _ -> ensurePermissionThenSend(target, message) }
                .show()
        }
    }

    private fun ensurePermissionThenSend(target: String, message: String) {
        if (checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED) {
            executeSms(target, message)
            return
        }
        pendingTarget = target
        pendingMessage = message
        requestPermissions(arrayOf(Manifest.permission.SEND_SMS), SMS_PERMISSION_REQUEST)
    }

    private fun executeSms(target: String, message: String) {
        try {
            sms.send(target, message)
            val file = receipts.record("android.sms", "send_sms", "confirm", "success", target, "SMS handed to Android telephony stack")
            toast("SMS executed. Signed receipt: ${file.name}")
        } catch (e: Exception) {
            receipts.record("android.sms", "send_sms", "confirm", "failed", target, e.message ?: "Unknown SMS failure")
            toast("SMS failed: ${e.message}")
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != SMS_PERMISSION_REQUEST) return
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            executeSms(pendingTarget, pendingMessage)
        } else {
            receipts.record("android.sms", "send_sms", "confirm", "blocked", pendingTarget, "SEND_SMS permission denied by user")
            toast("SMS permission denied")
        }
        pendingTarget = ""
        pendingMessage = ""
    }

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()

    companion object {
        private const val SMS_PERMISSION_REQUEST = 1001
    }
}
