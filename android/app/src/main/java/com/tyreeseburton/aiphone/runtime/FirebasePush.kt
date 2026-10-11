package com.tyreeseburton.aiphone.runtime

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject

object FirebasePush {
    fun ensureInitialized(context: Context, config: JSONObject) {
        if (FirebaseApp.getApps(context).isNotEmpty()) return
        val firebase = config.getJSONObject("firebase")
        val options = FirebaseOptions.Builder()
            .setApplicationId(firebase.getString("applicationId"))
            .setProjectId(firebase.getString("projectId"))
            .setApiKey(firebase.getString("apiKey"))
            .setGcmSenderId(firebase.getString("gcmSenderId"))
            .build()
        FirebaseApp.initializeApp(context.applicationContext, options)
            ?: error("Firebase initialization failed")
    }

    fun token(onResult: (Result<String>) -> Unit) {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful && !task.result.isNullOrBlank()) {
                onResult(Result.success(task.result))
            } else {
                onResult(Result.failure(task.exception ?: IllegalStateException("FCM token unavailable")))
            }
        }
    }
}
