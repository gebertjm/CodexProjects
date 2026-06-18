import 'package:flutter/material.dart';

class AppTheme {
  static const ink = Color(0xFF1E261F);
  static const moss = Color(0xFF66745F);
  static const ember = Color(0xFFB9502A);
  static const parchment = Color(0xFFF3EFE4);
  static const paper = Color(0xFFFFFAF0);

  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: ember,
      brightness: Brightness.light,
      surface: paper,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: parchment,
      textTheme: Typography.material2021().black.apply(
            bodyColor: ink,
            displayColor: ink,
            fontFamily: 'Georgia',
          ),
      cardTheme: CardThemeData(
        color: paper,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: BorderSide(color: ink.withValues(alpha: 0.12)),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: ember,
          foregroundColor: Colors.white,
          minimumSize: const Size(44, 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(999),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: ink,
          minimumSize: const Size(44, 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(999),
          ),
        ),
      ),
    );
  }
}
