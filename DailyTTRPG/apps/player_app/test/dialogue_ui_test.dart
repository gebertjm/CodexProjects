import 'package:dailyttrpg_player_app/api/models.dart';
import 'package:dailyttrpg_player_app/campaign/dialogue_scene_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _wrap(Widget child) {
  return MaterialApp(home: Scaffold(body: SingleChildScrollView(child: child)));
}

DialogueSceneView _dialogueFixture({
  bool withLatest = true,
  bool withInsight = true,
  bool exited = false,
}) {
  return DialogueSceneView(
    state: exited ? 'exited' : 'active',
    dialogueScene: const DialogueSceneInfo(
      dialogueSceneId: 'dialogue_elin_memory_focus_commit',
      title: 'A Memory By The Hearth',
    ),
    dialogueSceneState: DialogueSceneState(
      status: exited ? 'exited' : 'active',
      committedSocialMoveCount: 1,
      softTargetMax: 3,
      completedDialogueRecordId: exited ? '55' : null,
    ),
    participants: const [
      DialogueParticipant(
        participantId: 'npc:elin_harrow',
        label: 'a shaken woman',
      ),
    ],
    conversationSurface: const ConversationSurface(
      paragraphs: [
        DialogueSurfaceParagraph(
          kind: 'surface',
          text: 'She watches the fire instead of you.',
        ),
      ],
    ),
    latestDevelopment: withLatest
        ? const DialogueLatestDevelopment(summary: 'Her breathing steadies.')
        : null,
    passiveSocialInsight: withInsight
        ? const [
            PassiveSocialInsight(
              insightId: 'insight_hands',
              label: 'Her hands tighten when the shrine is mentioned.',
              visibility: 'narrative_only',
            ),
          ]
        : const [],
    clarifyingQuestions: const [
      DialogueClarifyingQuestion(
        questionId: 'clarify_first_memory',
        label: 'What do you remember first?',
        status: 'available',
        isAvailable: true,
        isAsked: false,
        checkPreview: DialogueCheckPreview(
          hasCheck: true,
          label: 'Insight check',
          dcVisible: false,
        ),
      ),
    ],
    committedSocialMoves: const [
      DialogueCommittedSocialMove(
        moveId: 'move_listen',
        label: 'Listen without pressing',
        status: 'available',
        isAvailable: true,
        spendsDialogueBeat: true,
        requiresCheck: false,
      ),
    ],
    dialogueExits: const [
      DialogueExit(
        exitId: 'exit_return_to_inn',
        label: 'Return to the common room',
        status: 'available',
        isAvailable: true,
      ),
    ],
  );
}

void main() {
  testWidgets('dialogue sections render in narrative-first order',
      (tester) async {
    final dialogue = _dialogueFixture();
    await tester.pumpWidget(
      _wrap(
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ConversationSurfaceCard(
              key: const Key('surface'),
              dialogue: dialogue,
            ),
            LatestDialogueDevelopmentCard(
              key: const Key('latest'),
              development: dialogue.latestDevelopment!,
            ),
            PassiveSocialInsightNote(
              key: const Key('insight'),
              insights: dialogue.passiveSocialInsight,
            ),
            ClarifyingQuestionList(
              key: const Key('clarifying'),
              questions: dialogue.clarifyingQuestions,
              onResolve: (question) async => question,
            ),
            CommittedSocialMoveComposer(
              key: const Key('composer'),
              dialogue: dialogue,
              onPreview: ({
                required submittedText,
                moveId,
                continueAsCommittedSocialMove = false,
                lifecycleContext,
              }) async {
                return const DialogueSocialMovePreviewResponse(
                  status: 'preview',
                );
              },
              onSubmit: ({
                required submittedText,
                moveId,
                continueAsCommittedSocialMove = false,
                lifecycleContext,
              }) async {
                return const DialogueSocialMoveSubmitResponse(
                  status: 'resolved',
                );
              },
              onAskClarifyingQuestion: (questionId) async {
                return dialogue.clarifyingQuestions.single;
              },
            ),
            DialogueExitPanel(
              key: const Key('exits'),
              exits: dialogue.dialogueExits,
              onResolveExit: (exit) async {
                return const DialogueExitResolveResponse(status: 'exited');
              },
            ),
            DialogueTranscriptArchive(
              key: const Key('archive'),
              dialogue: dialogue,
              completedRecord: null,
              activeTranscript: null,
              loading: false,
              onLoadCompletedRecord: () async {},
              onLoadActiveTranscript: () async {},
            ),
          ],
        ),
      ),
    );

    expect(find.text('A Memory By The Hearth'), findsOneWidget);
    expect(find.text('Latest Development'), findsOneWidget);
    expect(find.text('Passive Social Insight'), findsOneWidget);
    expect(find.text('Clarifying Questions'), findsOneWidget);
    expect(find.text('Committed Social Move'), findsOneWidget);

    final surfaceY = tester.getTopLeft(find.byKey(const Key('surface'))).dy;
    final latestY = tester.getTopLeft(find.byKey(const Key('latest'))).dy;
    final insightY = tester.getTopLeft(find.byKey(const Key('insight'))).dy;
    final clarifyingY =
        tester.getTopLeft(find.byKey(const Key('clarifying'))).dy;
    final composerY = tester.getTopLeft(find.byKey(const Key('composer'))).dy;

    expect(surfaceY < latestY, true);
    expect(latestY < insightY, true);
    expect(insightY < clarifyingY, true);
    expect(clarifyingY < composerY, true);
  });

  testWidgets('Clarifying Question resolves once and reopens persisted result',
      (tester) async {
    var resolveCount = 0;
    await tester.pumpWidget(
      _wrap(
        ClarifyingQuestionList(
          questions: _dialogueFixture().clarifyingQuestions,
          onResolve: (question) async {
            resolveCount += 1;
            return DialogueClarifyingQuestion(
              questionId: question.questionId,
              label: question.label,
              status: 'asked',
              isAvailable: false,
              isAsked: true,
              checkPreview: question.checkPreview,
              result: const DialogueTextResult(
                text: 'The wheel cracked first.',
                mechanicsLabel: 'Insight check: success',
              ),
            );
          },
        ),
      ),
    );

    expect(find.text('Insight check'), findsOneWidget);
    await tester.tap(find.text('What do you remember first?'));
    await tester.pumpAndSettle();

    expect(resolveCount, 1);
    expect(find.text('Insight check: success'), findsOneWidget);
    expect(find.text('The wheel cracked first.'), findsOneWidget);

    await tester.tap(find.text('What do you remember first?'));
    await tester.pumpAndSettle();
    expect(resolveCount, 1);
  });

  testWidgets(
      'Committed Social Move preview hides DC and submits no-check move',
      (tester) async {
    var previewed = false;
    var submitted = false;
    final dialogue = _dialogueFixture();
    await tester.pumpWidget(
      _wrap(
        CommittedSocialMoveComposer(
          dialogue: dialogue,
          onPreview: ({
            required submittedText,
            moveId,
            continueAsCommittedSocialMove = false,
            lifecycleContext,
          }) async {
            previewed = true;
            return const DialogueSocialMovePreviewResponse(
              status: 'preview',
              preview: DialogueSocialMovePreview(
                interpretation: 'You listen without pressing.',
                spendsDialogueBeat: true,
                requiresCheck: false,
                assistance: [
                  DialogueAssistanceNote(
                    label: 'Known context',
                    text: 'She is frightened.',
                  ),
                ],
              ),
            );
          },
          onSubmit: ({
            required submittedText,
            moveId,
            continueAsCommittedSocialMove = false,
            lifecycleContext,
          }) async {
            submitted = true;
            return const DialogueSocialMoveSubmitResponse(status: 'resolved');
          },
          onAskClarifyingQuestion: (questionId) async {
            return dialogue.clarifyingQuestions.single;
          },
        ),
      ),
    );

    await tester.tap(find.text('Listen without pressing'));
    await tester.pump();
    await tester.tap(find.text('Preview Social Move'));
    await tester.pumpAndSettle();

    expect(previewed, true);
    expect(find.text('This spends the dialogue beat.'), findsOneWidget);
    expect(find.text('Requires: no check.'), findsOneWidget);
    expect(find.textContaining('Known context'), findsOneWidget);
    expect(find.textContaining('DC 14'), findsNothing);

    await tester.tap(find.text('Submit Move'));
    await tester.pumpAndSettle();
    expect(submitted, true);
  });

  testWidgets('overlap warning is blocking and exposes three choices',
      (tester) async {
    var asked = false;
    var continued = false;
    await tester.pumpWidget(
      _wrap(
        SocialMovePreviewPanel(
          preview: const DialogueSocialMovePreviewResponse(
            status: 'clarifying_question_overlap',
            message: 'That is available as a Clarifying Question.',
            overlap: DialogueSocialMoveOverlap(
              questionId: 'clarify_first_memory',
              label: 'What do you remember first?',
            ),
          ),
          submitting: false,
          onAskClarifyingQuestion: (_) async {
            asked = true;
          },
          onContinueAsCommittedMove: () async {
            continued = true;
          },
          onEdit: () {},
          onSubmit: () async {},
        ),
      ),
    );

    expect(find.text('Ask Clarifying Question'), findsOneWidget);
    expect(find.text('Continue as Committed Social Move'), findsOneWidget);
    expect(find.text('Edit Action'), findsOneWidget);

    await tester.tap(find.text('Ask Clarifying Question'));
    await tester.pumpAndSettle();
    expect(asked, true);

    await tester.tap(find.text('Continue as Committed Social Move'));
    await tester.pumpAndSettle();
    expect(continued, true);
  });

  testWidgets('composer preserves continue-as-committed overlap bypass',
      (tester) async {
    var continuedPreview = false;
    var submitContinued = false;
    final dialogue = _dialogueFixture();
    await tester.pumpWidget(
      _wrap(
        CommittedSocialMoveComposer(
          dialogue: dialogue,
          onPreview: ({
            required submittedText,
            moveId,
            continueAsCommittedSocialMove = false,
            lifecycleContext,
          }) async {
            if (!continueAsCommittedSocialMove) {
              return const DialogueSocialMovePreviewResponse(
                status: 'clarifying_question_overlap',
                message: 'That is available as a Clarifying Question.',
                overlap: DialogueSocialMoveOverlap(
                  questionId: 'clarify_first_memory',
                  label: 'What do you remember first?',
                ),
              );
            }
            continuedPreview = true;
            return const DialogueSocialMovePreviewResponse(
              status: 'preview',
              preview: DialogueSocialMovePreview(
                interpretation: 'You spend the beat pressing the question.',
                spendsDialogueBeat: true,
                requiresCheck: true,
                checkPreview: DialogueCheckPreview(
                  hasCheck: true,
                  label: 'Persuasion check',
                  dcVisible: false,
                ),
              ),
            );
          },
          onSubmit: ({
            required submittedText,
            moveId,
            continueAsCommittedSocialMove = false,
            lifecycleContext,
          }) async {
            submitContinued = continueAsCommittedSocialMove;
            return const DialogueSocialMoveSubmitResponse(status: 'resolved');
          },
          onAskClarifyingQuestion: (questionId) async {
            return dialogue.clarifyingQuestions.single;
          },
        ),
      ),
    );

    await tester.enterText(
      find.byType(TextField),
      'I ask what she remembers first.',
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Preview Social Move'));
    await tester.pumpAndSettle();
    expect(find.text('That is available as a Clarifying Question.'),
        findsOneWidget);
    await tester.tap(find.text('Continue as Committed Social Move'));
    await tester.pumpAndSettle();

    expect(continuedPreview, true);
    expect(find.text('Persuasion check'), findsOneWidget);

    await tester.tap(find.text('Submit Move'));
    await tester.pumpAndSettle();
    expect(submitContinued, true);
  });

  testWidgets('exits resolve and transcript archive is collapsed by default',
      (tester) async {
    var exitCalled = false;
    final dialogue = _dialogueFixture(exited: true);
    await tester.pumpWidget(
      _wrap(
        Column(
          children: [
            DialogueExitPanel(
              exits: dialogue.dialogueExits,
              onResolveExit: (exit) async {
                exitCalled = true;
                return const DialogueExitResolveResponse(
                  status: 'exited',
                  exitResult: {'text': 'You return to the common room.'},
                );
              },
            ),
            DialogueTranscriptArchive(
              dialogue: dialogue,
              completedRecord: const CompletedDialogueRecord(
                completedDialogueRecordId: '55',
                compactSummary: 'Elin shared what she remembered.',
                transcriptTurns: [
                  DialogueTranscriptTurn(
                    turnId: '1',
                    turnIndex: 1,
                    turnType: 'clarifying_answer',
                    speakerLabel: 'a shaken woman',
                    content: {'text': 'The wheel cracked first.'},
                  ),
                ],
              ),
              activeTranscript: null,
              loading: false,
              onLoadCompletedRecord: () async {},
              onLoadActiveTranscript: () async {},
            ),
          ],
        ),
      ),
    );

    expect(find.text('Elin shared what she remembered.'), findsNothing);
    await tester.tap(find.text('Return to the common room'));
    await tester.pumpAndSettle();
    expect(exitCalled, true);

    await tester.tap(find.text('Transcript / Archive'));
    await tester.pumpAndSettle();
    expect(find.text('Elin shared what she remembered.'), findsOneWidget);
    expect(find.text('The wheel cracked first.'), findsOneWidget);
    expect(find.textContaining('preview_debug'), findsNothing);
    expect(find.textContaining('old_value_json'), findsNothing);
  });

  testWidgets('active transcript archive requests current player transcript',
      (tester) async {
    var loadCalled = false;
    await tester.pumpWidget(
      _wrap(
        DialogueTranscriptArchive(
          dialogue: _dialogueFixture(),
          completedRecord: null,
          activeTranscript: const DialogueCurrentTranscript(
            transcriptId: '44',
            turns: [
              DialogueTranscriptTurn(
                turnId: '1',
                turnIndex: 1,
                turnType: 'npc_surface',
                speakerLabel: 'a shaken woman',
                content: {'text': 'She watches the fire instead of you.'},
              ),
            ],
          ),
          loading: false,
          onLoadCompletedRecord: () async {},
          onLoadActiveTranscript: () async {
            loadCalled = true;
          },
        ),
      ),
    );

    expect(find.text('She watches the fire instead of you.'), findsNothing);
    await tester.tap(find.text('Transcript / Archive'));
    await tester.pumpAndSettle();
    expect(loadCalled, false);
    expect(find.text('She watches the fire instead of you.'), findsOneWidget);
  });
}
