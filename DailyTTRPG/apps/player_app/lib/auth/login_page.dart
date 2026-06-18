import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../shared/config/app_config.dart';
import '../shared/widgets/app_scaffold.dart';
import 'auth_service.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({required this.authService, super.key});

  final AuthService authService;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _createMode = false;
  bool _loading = false;
  String? _error;
  String? _notice;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _loading = true;
      _error = null;
      _notice = null;
    });

    try {
      await action();
    } on FirebaseAuthException catch (error) {
      setState(() => _error = _friendlyAuthError(error));
    } catch (error) {
      setState(() => _error = _friendlyUnexpectedError(error));
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  String _friendlyAuthError(FirebaseAuthException error) {
    final code = error.code.toLowerCase();
    final message = error.message?.trim();

    switch (code) {
      case 'configuration-not-found':
        return 'Firebase Authentication is not enabled for this project yet. In Firebase Console, open Authentication, click Get started, then enable Google and Email/Password.';
      case 'operation-not-allowed':
        return 'That sign-in method is not enabled yet. Enable Google and Email/Password in Firebase Authentication.';
      case 'unauthorized-domain':
        return 'This domain is not authorized for Firebase sign-in. Add dailyttrpg.com in Firebase Authentication authorized domains.';
      case 'popup-blocked':
        return 'The Google sign-in popup was blocked. Allow popups for dailyttrpg.com and try again.';
      case 'popup-closed-by-user':
        return 'Google sign-in was closed before it finished.';
      case 'invalid-email':
        return 'Enter a valid email address.';
      case 'weak-password':
        return 'Choose a stronger password.';
      case 'email-already-in-use':
        return 'That email already has an account. Try signing in instead.';
      case 'user-not-found':
      case 'wrong-password':
      case 'invalid-credential':
        return 'Email or password was not recognized.';
      default:
        if (message != null &&
            message.isNotEmpty &&
            message.toLowerCase() != 'error') {
          return message;
        }
        return 'Firebase sign-in failed ($code).';
    }
  }

  String _friendlyUnexpectedError(Object error) {
    final message = error.toString().trim();
    if (message.isEmpty || message.toLowerCase() == 'error') {
      return 'Sign-in failed. Check Firebase Authentication setup and try again.';
    }
    return message;
  }

  Future<void> _submitEmail() {
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (_createMode) {
      return _run(() => widget.authService.createAccountWithEmail(
            email: email,
            password: password,
          ));
    }

    return _run(() => widget.authService.signInWithEmail(
          email: email,
          password: password,
        ));
  }

  Future<void> _resetPassword() async {
    final email = _emailController.text.trim();

    if (email.isEmpty) {
      setState(() => _error = 'Enter your email first.');
      return;
    }

    await _run(() => widget.authService.sendPasswordReset(email));

    if (mounted && _error == null) {
      setState(
          () => _notice = 'Password reset email sent if the account exists.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: AppConfig.brandName,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Persistent tabletop adventures in your browser.',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Sign in to load your DailyTTRPG account, characters, and current adventure state.',
                  ),
                  if (!AppConfig.hasFirebaseConfig) ...[
                    const SizedBox(height: 16),
                    const _InlineWarning(
                      'Firebase web config is missing. Build with FIREBASE_WEB_API_KEY and FIREBASE_WEB_APP_ID dart-defines to enable sign-in.',
                    ),
                  ],
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    onPressed: _loading || !AppConfig.hasFirebaseConfig
                        ? null
                        : () => _run(widget.authService.signInWithGoogle),
                    icon: const Icon(Icons.login),
                    label: const Text('Continue with Google'),
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    decoration: const InputDecoration(
                      labelText: 'Email',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _passwordController,
                    obscureText: true,
                    autofillHints: const [AutofillHints.password],
                    decoration: const InputDecoration(
                      labelText: 'Password',
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (_) =>
                        AppConfig.hasFirebaseConfig ? _submitEmail() : null,
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _loading || !AppConfig.hasFirebaseConfig
                        ? null
                        : _submitEmail,
                    child: Text(_createMode ? 'Create Account' : 'Sign In'),
                  ),
                  TextButton(
                    onPressed: _loading
                        ? null
                        : () => setState(() => _createMode = !_createMode),
                    child: Text(
                      _createMode
                          ? 'Already have an account? Sign in'
                          : 'New here? Create an account',
                    ),
                  ),
                  TextButton(
                    onPressed: _loading || !AppConfig.hasFirebaseConfig
                        ? null
                        : _resetPassword,
                    child: const Text('Send password reset email'),
                  ),
                  if (_loading) const LinearProgressIndicator(),
                  if (_error != null) _InlineError(_error!),
                  if (_notice != null) _InlineNotice(_notice!),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Text(message,
          style: TextStyle(color: Theme.of(context).colorScheme.error)),
    );
  }
}

class _InlineWarning extends StatelessWidget {
  const _InlineWarning(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    return Text(message, style: const TextStyle(color: Color(0xFF873719)));
  }
}

class _InlineNotice extends StatelessWidget {
  const _InlineNotice(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Text(message),
    );
  }
}
