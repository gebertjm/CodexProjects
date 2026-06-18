import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api/api_client.dart';
import 'auth/auth_service.dart';
import 'campaign/campaign_diagnostics_page.dart';
import 'campaign/campaign_history_page.dart';
import 'campaign/campaign_knowledge_page.dart';
import 'campaign/dialogue_debug_workspace_page.dart';
import 'campaign/exploration_mechanics_inspector_page.dart';
import 'campaign/dialogue_scene_page.dart';
import 'campaign/campaign_preview_page.dart';
import 'campaign/campaign_scene_page.dart';
import 'characters/character_management_pages.dart';
import 'combat/combat_repository.dart';
import 'combat/combat_screen.dart';
import 'auth/login_page.dart';
import 'characters/character_creation_page.dart';
import 'dashboard/dashboard_page.dart';
import 'shared/config/app_config.dart';
import 'shared/theme/app_theme.dart';
import 'shared/widgets/placeholder_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (AppConfig.hasFirebaseConfig) {
    await Firebase.initializeApp(options: AppConfig.firebaseOptions);
  }

  runApp(const DailyTtrpgApp());
}

class DailyTtrpgApp extends StatefulWidget {
  const DailyTtrpgApp({super.key});

  @override
  State<DailyTtrpgApp> createState() => _DailyTtrpgAppState();
}

class _DailyTtrpgAppState extends State<DailyTtrpgApp> {
  late final FirebaseAuth _auth;
  late final AuthService _authService;
  late final AccountApi _accountApi;
  late final PlayerDashboardApi _dashboardApi;
  late final DialogueApi _dialogueApi;
  late final CombatRepository _combatRepository;
  late final CharacterCreationApi _characterCreationApi;
  late final CharacterManagementApi _characterManagementApi;

  String _route = _initialRoute();

  static String _initialRoute() {
    final path = Uri.base.path == '/play' ? '/play' : Uri.base.path;
    return Uri.base.query.isEmpty ? path : '$path?${Uri.base.query}';
  }

  @override
  void initState() {
    super.initState();
    _auth = AppConfig.hasFirebaseConfig
        ? FirebaseAuth.instance
        : _DisabledFirebaseAuth();
    _authService = AuthService(_auth);
    final apiClient = ApiClient(tokenProvider: AuthTokenProvider(_auth));
    _accountApi = AccountApi(
      apiClient,
    );
    _dashboardApi = PlayerDashboardApi(apiClient);
    _dialogueApi = DialogueApi(apiClient);
    _combatRepository = CombatHttpRepository(apiClient);
    _characterCreationApi = CharacterCreationApi(apiClient);
    _characterManagementApi = CharacterManagementApi(apiClient);
  }

  void _navigate(String route) {
    setState(() => _route = route);
    SystemNavigator.routeInformationUpdated(
      uri: Uri.parse(route),
      replace: false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.brandName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: StreamBuilder<User?>(
        stream: _authService.authStateChanges,
        initialData: _authService.currentUser,
        builder: (context, snapshot) {
          final user = snapshot.data;

          if (user == null) {
            return LoginPage(authService: _authService);
          }

          return _buildAuthenticated(user);
        },
      ),
    );
  }

  Widget _buildAuthenticated(User user) {
    final routeUri = Uri.parse(_route);
    final routePath = routeUri.path.isEmpty ? '/play' : routeUri.path;

    if (routePath.startsWith('/play/characters/') &&
        routePath != '/play/characters') {
      final characterId =
          routePath.split('/').where((part) => part.isNotEmpty).last;
      return CharacterSheetPage(
        characterId: characterId,
        characterManagementApi: _characterManagementApi,
        characterCreationApi: _characterCreationApi,
        onBack: () => _navigate('/play/characters'),
        onSignOut: _authService.signOut,
        navigate: _navigate,
      );
    }

    if (routePath.startsWith('/play/campaign/dialogue')) {
      return DialogueScenePage(
        dialogueApi: _dialogueApi,
        dashboardApi: _dashboardApi,
        onBack: () => _navigate('/play/campaign/scene'),
        onSignOut: _authService.signOut,
        navigate: _navigate,
        dialogueSceneId: routeUri.queryParameters['dialogue_scene_id'] ??
            routeUri.queryParameters['dialogueSceneId'],
        allowReentry: routeUri.queryParameters['allow_reentry'] == 'true' ||
            routeUri.queryParameters['allowReentry'] == 'true',
      );
    }

    switch (routePath) {
      case '/play/characters':
        return CharacterListPage(
          characterManagementApi: _characterManagementApi,
          characterCreationApi: _characterCreationApi,
          onBack: () => _navigate('/play'),
          onSignOut: _authService.signOut,
          navigate: _navigate,
        );
      case '/play/create-character':
      case '/play/create-character/quick':
      case '/play/create-character/guided':
      case '/play/create-character/detailed':
        return CharacterCreationPage(
          characterCreationApi: _characterCreationApi,
          characterManagementApi: _characterManagementApi,
          onBack: () => _navigate('/play'),
          onSignOut: _authService.signOut,
          navigate: _navigate,
        );
      case '/play/campaign':
        return CampaignPreviewPage(
          dashboardApi: _dashboardApi,
          onBack: () => _navigate('/play'),
          onSignOut: _authService.signOut,
          navigate: _navigate,
        );
      case '/play/campaign/scene':
        return CampaignScenePage(
          dashboardApi: _dashboardApi,
          onBack: () => _navigate('/play/campaign'),
          onSignOut: _authService.signOut,
          navigate: _navigate,
        );
      case '/play/combat':
        return CombatScreen(
          repository: _combatRepository,
          onBack: () => _navigate('/play/campaign/scene'),
          onSignOut: _authService.signOut,
          navigate: _navigate,
        );
      case '/play/campaign/history':
        return CampaignHistoryPage(
          dashboardApi: _dashboardApi,
          onSignOut: _authService.signOut,
          navigate: _navigate,
        );
      case '/play/campaign/knowledge':
        return CampaignKnowledgePage(
          dashboardApi: _dashboardApi,
          onSignOut: _authService.signOut,
          navigate: _navigate,
        );
      case '/play/dev/campaign-diagnostics':
        return CampaignDiagnosticsPage(
          dashboardApi: _dashboardApi,
          onSignOut: _authService.signOut,
          navigate: _navigate,
        );
      case '/play/dev/dialogue-debug':
        return DialogueDebugWorkspacePage(
          dashboardApi: _dashboardApi,
          onSignOut: _authService.signOut,
          navigate: _navigate,
        );
      case '/play/dev/exploration-mechanics':
        return ExplorationMechanicsInspectorPage(
          dashboardApi: _dashboardApi,
          onSignOut: _authService.signOut,
          navigate: _navigate,
        );
      case '/play/settings':
        return PlaceholderPage(
          title: 'Settings',
          message:
              'SMS is disabled by default. Notification preferences will be added later.',
          accountApi: _accountApi,
          onBack: () => _navigate('/play'),
          onSignOut: _authService.signOut,
        );
      case '/play/login':
      case '/play':
      default:
        return DashboardPage(
          dashboardApi: _dashboardApi,
          user: user,
          onSignOut: _authService.signOut,
          navigate: _navigate,
        );
    }
  }
}

class _DisabledFirebaseAuth implements FirebaseAuth {
  @override
  dynamic noSuchMethod(Invocation invocation) {
    if (invocation.memberName == #authStateChanges) {
      return Stream<User?>.value(null);
    }

    if (invocation.memberName == #currentUser) {
      return null;
    }

    return super.noSuchMethod(invocation);
  }
}
