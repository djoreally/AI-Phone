package com.tyreeseburton.aiphone.runtime

import android.content.Intent
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class AiPhoneFirebaseMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val data = remoteMessage.data
        val message = data["message"].orEmpty()

        if (message == MISSED_CALL || message == ANSWERED_ELSEWHERE) {
            val stop = Intent(this, IncomingCallService::class.java).apply {
                action = IncomingCallService.ACTION_STOP
            }
            startService(stop)
            return
        }

        val metadata = data["metadata"].orEmpty()
        if (metadata.isBlank()) return

        val caller = data["caller_id_number"]
            ?: data["caller_number"]
            ?: data["from"]
            ?: "Incoming call"

        val service = Intent(this, IncomingCallService::class.java).apply {
            putExtra(IncomingCallService.EXTRA_METADATA, metadata)
            putExtra(IncomingCallService.EXTRA_CALLER, caller)
        }
        startForegroundService(service)
    }

    companion object {
        private const val MISSED_CALL = "Missed call!"
        private const val ANSWERED_ELSEWHERE = "Answered Elsewhere"
    }
}
