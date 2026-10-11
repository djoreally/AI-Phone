package com.tyreeseburton.aiphone

import android.app.Application
import com.tyreeseburton.aiphone.runtime.FirebasePush

class AiPhoneApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        FirebasePush.initializeStored(this)
    }
}
