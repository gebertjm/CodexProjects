import 'package:firebase_core/firebase_core.dart';

class AppConfig {
  static const brandName = 'DailyTTRPG';

  static const firebaseApiKey = String.fromEnvironment('FIREBASE_WEB_API_KEY');
  static const firebaseAppId = String.fromEnvironment('FIREBASE_WEB_APP_ID');
  static const firebaseProjectId = String.fromEnvironment(
    'FIREBASE_PROJECT_ID',
    defaultValue: 'dailyrpg',
  );
  static const firebaseAuthDomain = String.fromEnvironment(
    'FIREBASE_AUTH_DOMAIN',
    defaultValue: 'dailyrpg.firebaseapp.com',
  );
  static const firebaseMessagingSenderId = String.fromEnvironment(
    'FIREBASE_MESSAGING_SENDER_ID',
  );
  static const firebaseStorageBucket = String.fromEnvironment(
    'FIREBASE_STORAGE_BUCKET',
    defaultValue: 'dailyrpg.appspot.com',
  );
  static const apiBaseUrlOverride = String.fromEnvironment(
    'DAILY_TTRPG_API_BASE_URL',
  );

  static bool get hasFirebaseConfig =>
      firebaseApiKey.isNotEmpty && firebaseAppId.isNotEmpty;

  static FirebaseOptions get firebaseOptions => const FirebaseOptions(
        apiKey: firebaseApiKey,
        appId: firebaseAppId,
        messagingSenderId: firebaseMessagingSenderId,
        projectId: firebaseProjectId,
        authDomain: firebaseAuthDomain,
        storageBucket: firebaseStorageBucket,
      );

  static Uri apiBaseUri() {
    if (apiBaseUrlOverride.isNotEmpty) {
      return Uri.parse(apiBaseUrlOverride);
    }

    final base = Uri.base;
    return Uri(
      scheme: base.scheme,
      host: base.host,
      port: base.hasPort ? base.port : null,
    );
  }
}
