# notification-listener

Android의 `NotificationListenerService`로 **등록한 카카오톡 채팅방의 알림만** 추적하고, 앱 내부 SQLite에 저장하는 로컬 Expo 모듈입니다.
**추적 채팅방** 탭에서 여러 방 이름을 등록·삭제하고, **메시지** 탭에서 채팅방·발신자·본문·시각을 목록으로 확인할 수 있습니다.
메시지는 시각 내림차순으로 조회하며, 100개씩 이전 기록을 추가로 불러올 수 있습니다.

## 실행

`mobile/`에서 Android 기기 또는 에뮬레이터를 연결하고 실행합니다.

```sh
npx expo run:android
```

앱 식별자가 아직 없다면 첫 빌드에서 Android package 이름을 지정합니다.
첫 화면의 **알림 접근 설정 열기**를 누르고 이 앱의 알림 접근을 허용합니다.
일반 알림 표시 권한인 `POST_NOTIFICATIONS`와는 별개입니다.
**추적 채팅방** 탭에서 수집할 방 이름도 등록해야 합니다. 처음에는 등록된 방이 없으므로 새 알림을 저장하지 않습니다.

Expo가 `modules/`의 네이티브 코드와 Manifest를 자동으로 연결하므로 별도 패키지나 config plugin은 필요하지 않습니다.
Expo Go는 지원하지 않으며, Kotlin 코드를 수정한 뒤에는 앱을 다시 빌드해야 합니다.
iOS와 웹에서는 `isAvailable()`과 `isPermissionGranted()`가 `false`를 반환하고, 나머지 API는 오류를 반환합니다.

## 수집 동작

- `com.kakao.talk`의 개별 메시지 중 DB에 등록된 방 이름과 일치하는 항목만 저장하고 이벤트로 전달합니다. 일치하는 메시지가 없는 알림은 원본도 새로 저장하지 않습니다.
- 방 이름은 앞뒤 공백을 제거한 뒤 정확하게 비교합니다. 부분 일치나 대소문자 변환은 하지 않습니다. 같은 이름을 가진 서로 다른 방은 이름만으로 구분할 수 없습니다.
- 추적 목록은 SQLite에 저장하므로 앱을 다시 열거나 JS 런타임이 없어도 유지됩니다. 등록된 방이 하나도 없으면 새 수집을 중단합니다.
- 서비스 연결 시 현재 알림창에 남은 알림도 가져옵니다. 이미 사라진 과거 알림은 복원할 수 없습니다.
- JS 런타임이나 이벤트 구독 없이도 Android가 서비스를 실행하는 동안 네이티브에서 수집합니다.
- 저장은 별도 작업 스레드에서 수행하고, 저장 완료 후 JS 이벤트를 보냅니다. 앱을 다시 열면 저장 기록을 조회할 수 있습니다.
- Android 알림 key, 게시 시각, 수집한 내용이 같은 기록은 중복 저장하지 않습니다. 같은 key의 내용이 변경되면 별도 기록으로 저장합니다.
- 앱을 삭제하거나 앱 데이터를 지우면 기록이 사라집니다. 자동 보존 기한이나 업로드는 없습니다.
- 방을 삭제하면 새 수집을 중단하고 메시지 목록에서도 숨깁니다. 기존 기록은 삭제하지 않아 같은 이름을 다시 등록하면 저장된 메시지를 다시 볼 수 있습니다.
- `clearCollectedNotifications()`는 원본 기록만 지우며 추적 방 설정은 유지합니다. 모든 수집을 중지하려면 추적 목록을 비우거나 Android 설정에서 알림 접근을 해제합니다.

사용자가 접근 권한을 해제하거나 앱을 **강제 종료**하면 수집할 수 없습니다.
OS/제조사의 백그라운드 제한, 알림 접근 필터, 업무 프로필 정책도 수신 범위에 영향을 줄 수 있습니다.
Android 15 이상에서는 OTP 등 민감한 내용이 가려질 수 있으며, 앱이 제공하지 않는 제목·본문은 `null`일 수 있습니다.
이 모듈은 Android가 제공한 값을 저장하며 이러한 제한을 우회하지 않습니다.

## 대화방 이름 분석

카카오톡 알림의 `title`은 발신자 이름일 수 있습니다. `title`, `text`, `groupKey`를
채팅방 이름으로 가정하지 않고 아래 원본 필드들을 비교합니다.

- `conversationTitle`: `android.conversationTitle`의 값입니다.
- `hiddenConversationTitle`: AndroidX가 알림 헤더에서 숨긴 대화 제목을 보관하는 `android.hiddenConversationTitle`의 값입니다.
- `conversationShortcut`: Android 12(API 31) 이상의 `Ranking.conversationShortcutInfo`에서 읽은 `id`, `packageName`, `longLabel`, `shortLabel`입니다. `notification.extras` 밖의 정보이므로 기존 raw JSON에는 없을 수 있습니다.
- `extras`: 앱별 추가 필드, `android.messages` 등 중첩된 데이터를 포함한 Android 알림 extras입니다.
- `tag`, `shortcutId`: 알림·바로가기 식별자를 분석하기 위한 값입니다. 채팅방 이름이나 고유 ID라는 보장은 없습니다.

Android 알림창은 대화 바로가기의 이름으로 대화 제목을 보완할 수 있습니다.
[SystemUI 구현](https://android.googlesource.com/platform/frameworks/base/+/master/packages/SystemUI/src/com/android/systemui/statusbar/notification/ConversationNotifications.kt)과 같이
바로가기의 `longLabel`, 비어 있으면 `shortLabel`을 우선합니다. 알림 key·패키지·바로가기 ID가 일치하는 정보만 사용합니다.
Android 12 미만이거나 대화 바로가기가 없으면 두 대화 제목을 확인합니다. 세 경로에 이름이 모두 없으면 확인할 수 없는 방으로 처리합니다.
카카오톡이 어떤 필드를 제공하는지는 실제 단체방·1:1 알림을 비교해야 합니다.
이 정보는 Kotlin에서 수집하므로 APK를 다시 빌드해 설치한 뒤 새로 받은 알림에서 확인합니다.
예전에 저장한 기록은 새 필드가 없을 수 있습니다.
수집 필드가 늘어나므로 업그레이드 후 첫 재연결에서는 기존 활성 알림이 새 진단 정보와 함께 한 번 더 저장될 수 있습니다.

`extras`는 Bundle, 배열, 목록, 텍스트, 숫자, 불리언과 `Person`을 JSON으로 변환합니다.
Bitmap, Icon, PendingIntent 등 지원하지 않는 객체는 원본 바이너리 대신
`{ "_type": "Android 클래스 이름", "_reason": "unsupported" }` 같은 진단 표식으로 표시합니다.
바이트 배열, 읽을 수 없는 값, 유한하지 않은 숫자, 깊이 8을 넘는 중첩도 표식으로 표시합니다.
추적 대상 알림의 원본 필드는 그대로 보존합니다. 메시지 목록에서는 아래 추출 규칙으로 파생한 값을 사용합니다.

## 카카오톡 메시지 추출과 저장

`com.kakao.talk`의 개별 알림에서 메시지를 추출하며 그룹 요약 알림은 제외합니다.
[참고 프로젝트의 NotificationListener](https://github.com/bssm-oss/kakao-talk-auto-bot/blob/main/app/src/main/java/com/example/chatbotchichi/NotificationListener.kt)의
알림·메시지 추출 방식을 참고했습니다. 참고 구현의 `title`/`sender` 방명 fallback은 발신자를 방 이름으로 오인할 수 있으므로 적용하지 않습니다.

- 본문은 `text` → `bigText` 순으로 확인합니다. `extras["android.messages"]`에 유효한 본문이 있으면 각 메시지의 본문을 사용합니다.
- `android.messages`는 마지막 항목만 고르지 않고 모든 유효한 항목을 처리합니다. Android 표준 Bundle 키인 `text`, `time`, `sender`, `sender_person`과 구형 `android.text`/`android.title`을 읽습니다.
- 발신자는 메시지의 `sender_person.name` → `sender` → 알림 `title` 순입니다.
- 본문이 있지만 발신자가 없으면 `알 수 없음`으로 보존합니다.
- 방 이름은 `conversationShortcut.longLabel` → `conversationShortcut.shortLabel` → `conversationTitle` → `hiddenConversationTitle` 순입니다.
- `title`, `sender`, `subText`, `summaryText`, 본문의 `발신자: 내용` 문자열은 방 이름의 근거로 사용하지 않습니다. 본문을 임의로 분리하지 않습니다.
- 이름을 확인할 수 없으면 `room: ""`, `roomSource: "unknown"`입니다. 이름이 없는 메시지는 추적 대상과 매칭하지 않고 새 원본·메시지를 저장하지 않습니다. 화면에서도 발신자 이름을 방 이름으로 대신 표시하지 않습니다.
- 단체방 여부는 `android.isGroupConversation`이 있으면 이를 사용하고, 없으면 확인된 `room != sender`로 추정합니다.
- 시각은 메시지의 `time` → 알림의 `notificationTimestamp`(`Notification.when`) → `postTime` 순입니다. 메시지별 시각이 없으면 UI에 **알림 시각**으로 표시합니다. 알림으로부터 실제 서버 전송 시각을 보장할 수는 없습니다.

`roomSource`는 `conversationShortcut`, `conversationTitle`, `hiddenConversationTitle`, `unknown` 중 하나입니다.
이름은 Android가 제공한 대화 정보에 근거하며, 카카오톡이 이 정보에도 이름을 제공하지 않으면 복원하지 않습니다.
`isGroupChatSource`가 `inferred`이면 단체방 여부 역시 추정값입니다.
버전·미리보기 설정에 따라 카카오톡이 제공하지 않는 내용은 추출할 수 없으며, 알림이 발생하지 않은 메시지나 과거 대화 내역은 수집할 수 없습니다.

SQLite v4의 `tracked_rooms` 테이블에 추적 방 이름을, `kakao_messages` 테이블에 메시지와 `room`/`room_source`를 별도로 보관합니다.
업그레이드 때 원본·메시지 기록의 ID·본문·발신자·시각과 추적 설정을 보존합니다.
과거 `title`/`sender`/`subText`/`summaryText`로 추정한 방 이름은 빈 이름과 `unknown`으로 변경해 추적·표시에서 제외합니다.
동일 메시지가 이후 확인된 방 이름과 함께 다시 전달되면 기존 ID를 유지하면서 이름을 보완할 수 있습니다.
기존 기록이 있어도 방을 등록하기 전에는 메시지 목록이 비어 있습니다. 새 원본과 추적 대상 파생 메시지는 하나의 트랜잭션으로 저장합니다.
JS가 실행 중이 아니어도 서비스에서 저장하며, 저장 완료 후에만 `onKakaoMessage` 이벤트를 보냅니다.

중복 키는 대화 식별 후보(`shortcutId` → `conversationShortcut.id` → `tag` → 알림 key), 발신자, 본문, 메시지 시각,
한 알림 배열 안에서 동일한 메시지가 나타난 순번으로 구성합니다.
같은 메시지 배열이 재전달되면 다시 저장하지 않으며, 같은 내용을 다른 시각에 보내면 별개의 메시지로 남습니다.
한 배열에 동일한 시각·본문의 메시지가 여러 개 있어도 해당 개수를 보존합니다.
다만 배열의 오래된 항목이 잘리거나 메시지별 시각·안정적인 대화 식별자가 없는 경우 완벽한 중복 구분을 보장할 수 없습니다.
재전달된 메시지에 더 정확한 방 이름·단체방 여부·시각 출처가 있으면 기존 ID를 유지한 채 해당 정보를 보완합니다.

## 카카오톡 메시지 API

```ts
import NotificationListener from '@/modules/notification-listener';

// 빈 배열은 새 수집 중단. 저장 결과는 공백·중복을 정리하고 정렬한 이름 목록입니다.
await NotificationListener.setTrackedRooms(['수학과제토론방', '개발 동아리']);
const rooms = await NotificationListener.getTrackedRooms();

const messages = await NotificationListener.getKakaoMessages({ limit: 100 });
const last = messages.at(-1);
const older = last
  ? await NotificationListener.getKakaoMessages({ beforeId: last.messageId })
  : [];

const subscription = NotificationListener.addListener('onKakaoMessage', (message) => {
  console.log(message.room, message.sender, message.msg, message.timestamp);
});
// NotificationListener.addKakaoMessageListener(callback)도 같은 이벤트를 구독합니다.
subscription.remove();
```

각 `KakaoMessage`는 `messageId`, `room`, `sender`, `msg`, `isGroupChat`, `timestamp`,
`timestampSource`, `roomSource`, `isGroupChatSource`, `notificationKey`를 제공합니다.
`getKakaoMessages()`는 현재 등록한 방의 기록만 `(timestamp, messageId)` 내림차순으로 반환합니다. 필터를 DB에서 페이지 제한 전에 적용합니다.
`beforeId`에는 이전 페이지 마지막 메시지 ID를 전달합니다. 추적 목록을 바꾸면 이전 페이지 커서를 버리고 처음부터 조회해야 합니다.
`clearKakaoMessages()`는 메시지 기록을 지우며 원본 알림 기록은 별도로 유지합니다.
`getTrackedRooms()`/`setTrackedRooms()`로 설정을 조회·교체합니다. 교체는 트랜잭션으로 처리하며 저장 실패 시 기존 목록을 유지합니다.
`addTrackedRoom(name)`/`removeTrackedRoom(name)`은 최신 DB 목록을 읽어 해당 이름만 추가·삭제합니다.
설정 작업은 JS에서도 순서대로 처리해 동시에 편집해도 다른 방 이름을 덮어쓰지 않습니다.
`isTrackedRoomsSupported()`로 APK의 설정 API 지원 여부를 확인하고,
`addTrackedRoomsListener(callback)`으로 DB에서 확인된 목록의 변경을 구독할 수 있습니다. 이 구독은 같은 JS 런타임 안에서 동작합니다.

이 기능은 새 Kotlin 코드와 DB 마이그레이션을 포함하므로 APK를 다시 빌드하여 설치해야 합니다.
예전 개발 빌드에서는 새 APK 설치가 필요하다는 오류를 표시합니다.
네이티브의 `roomResolutionVersion` 값으로 수정된 방명 추출 로직의 포함 여부도 검사하므로, 예전 APK를 새 JS 코드에 연결해도 발신자를 방명으로 표시하지 않습니다.

## 원본 알림 API

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
이 진단 API는 예전 버전에서 저장된 원본도 그대로 반환합니다. 추적 목록 변경은 과거 원본 기록을 삭제하지 않습니다.
`limit`는 기본 100, 범위 1–500이고, `beforeId`는 이전 페이지 마지막 기록의 ID입니다.
`postTime`은 Android의 게시 시각, `receivedAt`은 이 서비스가 수신한 시각이며 단위는 Unix 밀리초입니다.
실시간 이벤트는 구독 중에만 제공하므로 앱 재진입 시 저장 기록을 다시 조회합니다.

모듈의 JS API 테스트: `node --test modules/notification-listener/tests/*.test.cjs`
`tracked-rooms-store.test.cjs`는 Node의 `node:sqlite`로 DB 마이그레이션·필터·페이지 조회·트랜잭션을 검증합니다.
추출 로직의 순수 JVM 테스트: `tests/KakaoMessageParserTest.kt`(Android SDK 불필요, 파일 상단 실행 방법 참고).
추적 방 이름 정리·매칭의 순수 JVM 테스트: `tests/TrackedRoomsTest.kt`.

## 기기 확인

1. 새 APK를 설치하고 알림 접근 권한을 허용합니다. 등록된 방이 없을 때는 알림을 받아도 새 원본·메시지를 저장하지 않는지 확인합니다.
2. **추적 채팅방** 탭에 서로 다른 1:1/단체방 이름을 여러 개 등록합니다. 등록된 방과 미등록 방에서 메시지를 보내 등록된 방만 **메시지** 탭에 표시되는지 확인합니다. 추정값과 알림 시각 표기도 확인합니다.
3. 앱을 백그라운드로 보내거나 최근 앱 목록에서 닫은 뒤 메시지를 수신하고, 다시 열어 기록과 이전 페이지를 확인합니다.
4. 같은 본문을 다른 시각에 두 번 보낸 경우 두 항목이 남고, 동일 알림의 재전달·재연결은 항목 수를 늘리지 않는지 확인합니다.
5. 권한 해제 후 새 수집이 멈추고, 다시 허용하면 재개되는지 확인합니다. 강제 종료 중 사라진 알림은 복원되지 않습니다.
6. 방을 삭제하고 메시지 탭으로 돌아가 해당 기록이 숨겨지고 새 메시지를 저장하지 않는지 확인합니다. 같은 방을 다시 등록하면 보존된 기록이 나타나는지, 앱 재시작 후에도 추적 목록이 유지되는지 확인합니다.
7. `title`이 발신자이고 두 대화 제목이 비어 있는 알림에서 `conversationShortcut`의 이름이 방 이름으로 사용되는지 확인합니다. 해당 정보까지 없는 알림은 발신자 이름으로 오인해 저장하지 않아야 합니다.

공식 문서: [Expo 로컬 모듈](https://docs.expo.dev/modules/get-started/),
[Android NotificationListenerService](https://developer.android.com/reference/android/service/notification/NotificationListenerService),
[Android 15의 민감한 알림 제한](https://developer.android.com/about/versions/15/behavior-changes-all#otp-redaction).
