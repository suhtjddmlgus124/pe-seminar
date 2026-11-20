# talkreminder

카카오톡 알림을 모아 채팅방별로 확인하고, 중요한 메시지를 즐겨찾기에 보관하는 Android 앱입니다.

## 개발 서버 실행

저장소 루트에서 실행합니다. 처음 실행하거나 의존성이 바뀌었을 때는 `npm install`이 필요합니다.

```bash
cd mobile
npm install
npx expo start
```

휴대폰과 컴퓨터를 같은 네트워크에 연결한 뒤, 기존에 설치한 개발용 APK에서 개발 서버를 열거나 터미널의 QR 코드를 스캔합니다. 이 프로젝트는 `expo-dev-client`를 사용하므로 `npx expo start`가 개발용 앱을 기본 실행 대상으로 선택합니다. 실행 대상이 Expo Go로 바뀌었다면 터미널에서 `s`를 눌러 개발용 앱으로 전환할 수 있습니다.

카카오톡 알림 수집에는 앱의 알림 접근 권한과 자체 Android 모듈이 필요합니다. 이 기능은 Expo Go에서 사용할 수 없습니다.

화면과 JavaScript 변경은 개발 서버를 통해 기존 개발용 APK에서 확인할 수 있습니다. 앱 표시 이름은 `talkreminder`로 설정되어 있으며, **휴대폰 홈 화면의 앱 이름은 개발용 APK를 다시 빌드하고 설치해야 바뀝니다.** 기존 개발용 APK와 계속 연결할 수 있도록 프로젝트 slug, URL scheme, Android 패키지명과 EAS 프로젝트 연결은 유지합니다.

## 테스터용 APK 배포

`preview` 빌드는 개발 서버 없이 실행되는 APK입니다. `mobile` 디렉터리에서 실행합니다.

```bash
npx eas-cli@latest build --platform android --profile preview
```

빌드가 완료되면 APK를 다운로드해 GitHub Releases에 첨부합니다. 첫 테스트 배포 버전은 `0.1.0`, Git 태그는 `v0.1.0`, 파일명은 `talkreminder-0.1.0.apk`를 사용합니다. GitHub 등록은 수동으로 진행합니다.

사용자에게 표시되는 버전은 `app.json`, `package.json`, `package-lock.json`에서 함께 관리합니다. Android 설치·업데이트 순서는 `app.json`의 `android.versionCode`로 관리하므로, 다음 배포에서는 이전 빌드보다 큰 값으로 올려 주세요. 기존 설치 데이터를 유지하려면 Android 패키지명과 EAS 서명 키를 유지합니다.

`development` 빌드와 `npx expo start`도 계속 사용할 수 있습니다. 두 빌드는 같은 Android 패키지명을 사용하므로 휴대폰에 설치하면 서로 교체됩니다.

## 코드 확인

`mobile` 디렉터리에서 실행합니다.

```bash
npx expo lint
npx tsc --noEmit
```

실행 방식은 [Expo CLI 문서](https://docs.expo.dev/more/expo-cli/#launch-target), 표시 이름 설정은 [Expo SDK 58 앱 설정 문서](https://docs.expo.dev/versions/v58.0.0/config/app/#name)를 참고하세요.
