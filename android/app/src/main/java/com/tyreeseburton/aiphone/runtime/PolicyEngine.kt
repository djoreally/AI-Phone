package com.tyreeseburton.aiphone.runtime

data class PolicyDecision(
    val decision: Decision,
    val level: Int,
    val reason: String,
)

enum class Decision { ALLOW, CONFIRM, DENY }

object PolicyEngine {
    fun evaluate(capability: String, tool: String): PolicyDecision {
        return when ("$capability:$tool") {
            "android.sms:send_sms" -> PolicyDecision(
                decision = Decision.CONFIRM,
                level = 3,
                reason = "Sending a message acts on the world and requires confirmation.",
            )
            else -> PolicyDecision(Decision.DENY, 4, "Capability is not registered on this runtime.")
        }
    }
}
