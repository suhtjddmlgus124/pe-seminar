# notification-listener

Android의 `NotificationListenerService`로 모든 앱의 알림을 수집하고, 앱 내부 SQLite에 저장하는 로컬 Expo 모듈입니다.
앱 첫 화면에서 알림 접근 설정을 열고 최근 수집 기록 100개를 확인할 수 있습니다.

## 실행

`mobile/`에서 Android 기기 또는 에뮬레이터를 연결하고 실행합니다.

```sh
npx expo run:android
```

앱 식별자가 아직 없다면 첫 빌드에서 Android package 이름을 지정합니다.
첫 화면의 **알림 접근 설정 열기**를 누르고 이 앱의 알림 접근을 허용합니다.
일반 알림 표시 권한인 `POST_NOTIFICATIONS`와는 별개입니다.

Expo가 `modules/`의 네이티브 코드와 Manifest를 자동으로 연결하므로 별도 패키지나 config plugin은 필요하지 않습니다.
Expo Go는 지원하지 않으며, Kotlin 코드를 수정한 뒤에는 앱을 다시 빌드해야 합니다.
iOS와 웹에서는 `isAvailable()`과 `isPermissionGranted()`가 `false`를 반환하고, 나머지 API는 오류를 반환합니다.

## 수집 동작

- 앱 패키지, 그룹 요약, 무음, 진행 중 알림을 코드에서 제외하지 않습니다. Android가 이 서비스에 전달한 알림을 저장합니다.
- 서비스 연결 시 현재 알림창에 남은 알림도 가져옵니다. 이미 사라진 과거 알림은 복원할 수 없습니다.
- JS 런타임이나 이벤트 구독 없이도 Android가 서비스를 실행하는 동안 네이티브에서 수집합니다.
- 저장은 별도 작업 스레드에서 수행하고, 저장 완료 후 JS 이벤트를 보냅니다. 앱을 다시 열면 저장 기록을 조회할 수 있습니다.
- Android 알림 key, 게시 시각, 수집한 내용이 같은 기록은 중복 저장하지 않습니다. 같은 key의 내용이 변경되면 별도 기록으로 저장합니다.
- 앱을 삭제하거나 앱 데이터를 지우면 기록이 사라집니다. 자동 보존 기한이나 업로드는 없습니다.
- `clearCollectedNotifications()`는 저장 기록만 지웁니다. 수집을 중지하려면 Android 설정에서 알림 접근을 해제합니다.

사용자가 접근 권한을 해제하거나 앱을 **강제 종료**하면 수집할 수 없습니다.
OS/제조사의 백그라운드 제한, 알림 접근 필터, 업무 프로필 정책도 수신 범위에 영향을 줄 수 있습니다.
Android 15 이상에서는 OTP 등 민감한 내용이 가려질 수 있으며, 앱이 제공하지 않는 제목·본문은 `null`일 수 있습니다.
이 모듈은 Android가 제공한 값을 저장하며 이러한 제한을 우회하지 않습니다.

## API

```ts
import NotificationListener from '@/modules/notification-listener';

if (NotificationListener.isAvailable()) {
  // 권한이 없어도 이전에 저장된 기록은 조회할 수 있습니다.
  const latest = await NotificationListener.getCollectedNotifications({ limit: 100 });
  const last = latest.at(-1);
  const older = last
    ? await NotificationListener.getCollectedNotifications({ beforeId: last.collectionId })
    : [];

  // 콜백에는 DB에 저장된 기록과 동일한 collectionId/receivedAt이 포함됩니다.
  const subscription = NotificationListener.addNotificationListener((notification) => {
    // notification.packageName, title, text, bigText, textLines 등을 사용합니다.
  });
  subscription.remove();

  if (!NotificationListener.isPermissionGranted()) {
    await NotificationListener.openSettings();
    // 함수 완료는 설정 화면이 열렸다는 의미입니다.
    // AppState가 active로 바뀌면 isPermissionGranted()를 다시 확인합니다.
  }
}
```

`getCollectedNotifications({ limit?, beforeId? })`는 `collectionId` 내림차순으로 반환합니다.
`limit`는 기본 100, 범위 1–500이고, `beforeId`는 이전 페이지 마지막 기록의 ID입니다.
`postTime`은 Android의 게시 시각, `receivedAt`은 이 서비스가 수신한 시각이며 단위는 Unix 밀리초입니다.
실시간 이벤트는 구독 중에만 제공하므로 앱 재진입 시 저장 기록을 다시 조회합니다.

모듈의 JS API 테스트: `node --test modules/notification-listener/tests/*.test.cjs`

## 기기 확인

1. 첫 화면에서 알림 접근 권한을 허용하고 알림창에 남아 있던 알림이 표시되는지 확인합니다.
2. 서로 다른 앱에서 알림을 발생시키고, 패키지명과 내용이 기록되는지 확인합니다.
3. 홈으로 나가거나 최근 앱 목록에서 앱을 닫은 상태에서 알림을 발생시킨 뒤 앱을 다시 열어 기록을 확인합니다.
4. 같은 알림을 갱신하면 새 내용이 보존되고, 변경 없이 서비스가 재연결되면 중복이 늘지 않는지 확인합니다.
5. 권한 해제 후 수집이 멈추고, 다시 허용하면 수집이 재개되는지 확인합니다. 강제 종료 중 사라진 알림은 복원되지 않습니다.

공식 문서: [Expo 로컬 모듈](https://docs.expo.dev/modules/get-started/),
[Android NotificationListenerService](https://developer.android.com/reference/android/service/notification/NotificationListenerService),
[Android 15의 민감한 알림 제한](https://developer.android.com/about/versions/15/behavior-changes-all#otp-redaction).
