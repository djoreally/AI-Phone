package com.tyreeseburton.aiphone.runtime

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.IBinder
import com.tyreeseburton.aiphone.MainActivity

class IncomingCallService : Service() {
    override fun onCreate() {
        super.onCreate()
        ensureChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        val metadata = intent?.getStringExtra(EXTRA_METADATA).orEmpty()
        val caller = intent?.getStringExtra(EXTRA_CALLER).orEmpty().ifBlank { "Incoming call" }
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_METADATA, metadata)
            putExtra(EXTRA_CALLER, caller)
            putExtra(EXTRA_FROM_PUSH, true)
        }
        val pending = PendingIntent.getActivity(
            this,
            7001,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )

        val notification = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setContentTitle(caller)
            .setContentText("Incoming AI Phone call")
            .setCategory(Notification.CATEGORY_CALL)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(pending)
            .setFullScreenIntent(pending, true)
            .setPriority(Notification.PRIORITY_MAX)
            .build()

        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun ensureChannel() {
        val manager = getSystemService(NotificationManager::class.java)
        val ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        val audio = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .build()
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Incoming AI Phone calls",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Incoming calls delivered by the AI Phone voice runtime"
            setSound(ringtone, audio)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        manager.createNotificationChannel(channel)
    }

    companion object {
        const val ACTION_STOP = "com.tyreeseburton.aiphone.STOP_INCOMING_CALL"
        const val EXTRA_METADATA = "telnyxPushMetaData"
        const val EXTRA_CALLER = "callerNumber"
        const val EXTRA_FROM_PUSH = "fromVoicePush"
        private const val CHANNEL_ID = "ai_phone_incoming_calls"
        private const val NOTIFICATION_ID = 7301
    }
}
