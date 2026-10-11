package com.tyreeseburton.aiphone.capabilities

import android.telephony.SmsManager

class SmsCapability {
    fun send(phoneNumber: String, message: String) {
        require(phoneNumber.isNotBlank()) { "Phone number is required" }
        require(message.isNotBlank()) { "Message is required" }
        @Suppress("DEPRECATION")
        SmsManager.getDefault().sendTextMessage(phoneNumber, null, message, null, null)
    }
}
