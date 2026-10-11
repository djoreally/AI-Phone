package com.tyreeseburton.aiphone.runtime

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject

object FirebasePush {
    private const val PREFS = "firebase_runtime"

    fun ensureInitialized(context: Context, config: JSONObject) {
        val firebase = config.getJSONObject("firebase")
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit()
            .putString("applicationId", firebase.getString("applicationId"))
            .putString("projectId", firebase.getString("projectId"))
            .putString("apiKey", firebase.getString("apiKey"))
            .putString("gcmSenderId", firebase.getString("gcmSenderId"))
            .apply()
        initializeStored(context)
    }

    fun initializeStored(context: Context) {
        if (FirebaseApp.getApps(context).isNotEmpty()) return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val applicationId = prefs.getString("applicationId", null) ?: return
        val projectId = prefs.getString("projectId", null) ?: return
        val apiKey = prefs.getString("apiKey", null) ?: return
        val senderId = prefs.getString("gcmSenderId", null) ?: return
        val options = FirebaseOptions.Builder()
            .setApplicationId(applicationId)
            .setProjectId(projectId)
            .setApiKey(apiKey)
            .setGcmSenderId(senderId)
            .build()
        FirebaseApp.initializeApp(context.applicationContext, options)
            ?: error("Firebase initialization failed")
    }

    fun token(context: Context, onResult: (Result<String>) -> Unit) {
        initializeStored(context)
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful && !task.result.isNullOrBlank()) {
                storeToken(context, task.result)
                onResult(Result.success(task.result))
            } else {
                onResult(Result.failure(task.exception ?: IllegalStateException("FCM token unavailable")))
            }
        }
    }

    fun storeToken(context: Context, token: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString("fcmToken", token).apply()
    }

    fun storedToken(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString("fcmToken", null)
}
