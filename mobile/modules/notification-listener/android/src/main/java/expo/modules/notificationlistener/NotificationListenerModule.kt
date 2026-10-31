package expo.modules.notificationlistener

import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationListenerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val observer: (Map<String, Any?>) -> Unit = { notification ->
    sendEvent("onNotificationPosted", notification)
  }

  override fun definition() = ModuleDefinition {
    Name("NotificationListener")

    Events("onNotificationPosted")

    Function("isPermissionGranted") {
      val component = ComponentName(context, NotificationListenerService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        context.getSystemService(NotificationManager::class.java)
          .isNotificationListenerAccessGranted(component)
      } else {
        val enabled = Settings.Secure.getString(
          context.contentResolver,
          "enabled_notification_listeners"
        )
        enabled?.split(':')?.any {
          ComponentName.unflattenFromString(it) == component
        } ?: false
      }
    }

    AsyncFunction("openSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }

    AsyncFunction("getCollectedNotifications") { limit: Int, beforeId: Long?, promise: Promise ->
      val application = context.applicationContext
      NotificationStore.executor.execute {
        try {
          promise.resolve(NotificationStore.getInstance(application).getNotifications(limit, beforeId))
        } catch (error: Exception) {
          promise.reject("ERR_NOTIFICATION_READ", "Unable to read collected notifications", error)
        }
      }
    }

    AsyncFunction("clearCollectedNotifications") { promise: Promise ->
      val application = context.applicationContext
      NotificationStore.executor.execute {
        try {
          NotificationStore.getInstance(application).clear()
          promise.resolve()
        } catch (error: Exception) {
          promise.reject("ERR_NOTIFICATION_CLEAR", "Unable to clear collected notifications", error)
        }
      }
    }

    OnStartObserving("onNotificationPosted") {
      NotificationListenerService.observers.add(observer)
    }

    OnStopObserving("onNotificationPosted") {
      NotificationListenerService.observers.remove(observer)
    }

    OnDestroy {
      NotificationListenerService.observers.remove(observer)
    }
  }
}
