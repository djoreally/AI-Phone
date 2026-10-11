package com.tyreeseburton.aiphone.capabilities

import android.content.Context
import com.telnyx.webrtc.sdk.CredentialConfig
import com.telnyx.webrtc.sdk.TelnyxClient
import com.telnyx.webrtc.sdk.model.LogLevel
import com.telnyx.webrtc.sdk.model.SocketMethod
import com.telnyx.webrtc.sdk.model.SocketStatus
import com.telnyx.webrtc.sdk.verto.receive.InviteResponse
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * Media-plane adapter for the physical handset.
 *
 * Provider credentials are provisioned onto the enrolled phone; callers never
 * interact with Telnyx directly. The rest of the runtime speaks phone.call.*.
 */
class TelnyxHandsetVoice(context: Context) {
    data class Credentials(
        val sipUser: String,
        val sipPassword: String,
        val callerIdName: String,
        val callerIdNumber: String,
        val fcmToken: String? = null,
    )

    data class IncomingCall(
        val callId: UUID,
        val callerNumber: String,
    )

    private val client = TelnyxClient(context.applicationContext)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var eventJob: Job? = null
    private var credentials: Credentials? = null

    var onIncomingCall: ((IncomingCall) -> Unit)? = null

    fun connect(input: Credentials) {
        credentials = input
        val config = CredentialConfig(
            sipUser = input.sipUser,
            sipPassword = input.sipPassword,
            sipCallerIDName = input.callerIdName,
            sipCallerIDNumber = input.callerIdNumber,
            fcmToken = input.fcmToken,
            ringtone = null,
            ringBackTone = null,
            logLevel = LogLevel.INFO,
            autoReconnect = true,
        )
        watchEvents()
        client.connect(credentialConfig = config)
    }

    fun startCall(destinationNumber: String, clientState: String = "ai-phone") {
        val identity = credentials ?: error("Voice client is not provisioned")
        client.call.newInvite(
            callerName = identity.callerIdName,
            callerNumber = identity.callerIdNumber,
            destinationNumber = destinationNumber,
            clientState = clientState,
        )
    }

    fun answer(callId: UUID, callerNumber: String) {
        client.acceptCall(callId, callerNumber)
    }

    fun reject(callId: UUID) {
        client.endCall(callId)
    }

    fun end(callId: UUID) {
        client.endCall(callId)
    }

    fun close() {
        eventJob?.cancel()
        scope.cancel()
    }

    private fun watchEvents() {
        if (eventJob?.isActive == true) return
        eventJob = scope.launch {
            client.socketResponseFlow.collect { response ->
                if (response.status != SocketStatus.MESSAGERECEIVED) return@collect
                val data = response.data ?: return@collect
                if (data.method != SocketMethod.INVITE.methodName) return@collect
                val invite = data.result as? InviteResponse ?: return@collect
                onIncomingCall?.invoke(
                    IncomingCall(
                        callId = invite.callId,
                        callerNumber = invite.callerIdNumber,
                    )
                )
            }
        }
    }
}
