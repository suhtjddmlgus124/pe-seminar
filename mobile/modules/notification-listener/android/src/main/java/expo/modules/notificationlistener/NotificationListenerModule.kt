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

  private val kakaoObserver: (Map<String, Any?>) -> Unit = { message ->
    sendEvent("onKakaoMessage", message)
  }

  private val discoveredRoomsObserver: () -> Unit = {
    sendEvent("onDiscoveredRoomsChanged", emptyMap<String, Any?>())
  }

  override fun definition() = ModuleDefinition {
    Name("NotificationListener")

    Constant("roomResolutionVersion") { 1 }

    Events("onNotificationPosted", "onKakaoMessage", "onDiscoveredRoomsChanged")

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

    AsyncFunction("getTrackedRooms") { promise: Promise ->
      val application = context.applicationContext
      NotificationStore.executor.execute {
        try {
          promise.resolve(NotificationStore.getInstance(application).getTrackedRooms())
        } catch (error: Exception) {
          promise.reject("ERR_TRACKED_ROOMS_READ", "추적할 채팅방 목록을 불러오지 못했습니다.", error)
        }
      }
    }

    AsyncFunction("getDiscoveredRooms") { promise: Promise ->
      val application = context.applicationContext
      NotificationStore.executor.execute {
        try {
          promise.resolve(NotificationStore.getInstance(application).getDiscoveredRooms())
        } catch (error: Exception) {
          promise.reject("ERR_DISCOVERED_ROOMS_READ", "알림에서 발견한 채팅방 목록을 불러오지 못했습니다.", error)
        }
      }
    }

    AsyncFunction("setTrackedRooms") { rooms: List<String>, promise: Promise ->
      val application = context.applicationContext
      NotificationStore.executor.execute {
        try {
          promise.resolve(NotificationStore.getInstance(application).setTrackedRooms(rooms))
        } catch (error: Exception) {
          promise.reject("ERR_TRACKED_ROOMS_WRITE", "추적할 채팅방 목록을 저장하지 못했습니다.", error)
        }
      }
    }

    AsyncFunction("getKakaoMessages") { limit: Int, beforeId: Long?, promise: Promise ->
      val application = context.applicationContext
      NotificationStore.executor.execute {
        try {
          promise.resolve(NotificationStore.getInstance(application).getKakaoMessages(limit, beforeId))
        } catch (error: Exception) {
          promise.reject("ERR_KAKAO_MESSAGES_READ", "카카오톡 메시지 기록을 불러오지 못했습니다.", error)
        }
      }
    }

    AsyncFunction("clearKakaoMessages") { promise: Promise ->
      val application = context.applicationContext
      NotificationStore.executor.execute {
        try {
          NotificationStore.getInstance(application).clearKakaoMessages()
          promise.resolve()
        } catch (error: Exception) {
          promise.reject("ERR_KAKAO_MESSAGES_CLEAR", "카카오톡 메시지 기록을 삭제하지 못했습니다.", error)
        }
      }
    }

    OnStartObserving("onNotificationPosted") {
      NotificationListenerService.observers.add(observer)
    }

    OnStopObserving("onNotificationPosted") {
      NotificationListenerService.observers.remove(observer)
    }

    OnStartObserving("onKakaoMessage") {
      NotificationListenerService.kakaoObservers.add(kakaoObserver)
    }

    OnStopObserving("onKakaoMessage") {
      NotificationListenerService.kakaoObservers.remove(kakaoObserver)
    }

    OnStartObserving("onDiscoveredRoomsChanged") {
      NotificationListenerService.discoveredRoomsObservers.add(discoveredRoomsObserver)
    }

    OnStopObserving("onDiscoveredRoomsChanged") {
      NotificationListenerService.discoveredRoomsObservers.remove(discoveredRoomsObserver)
    }

    OnDestroy {
      NotificationListenerService.observers.remove(observer)
      NotificationListenerService.kakaoObservers.remove(kakaoObserver)
      NotificationListenerService.discoveredRoomsObservers.remove(discoveredRoomsObserver)
    }
  }
}
