export function cloneFixture(value) {
  return JSON.parse(JSON.stringify(value));
}

export const validMinimalDialogueScene = Object.freeze({
  id: 'dialogue_elin_memory_focus_commit',
  slug: 'elin-memory-focus-commit',
  title: 'Elin remembers the road',
  interaction_domain: 'dialogue_focus_commit',
  scene_type: 'dialogue',
  participants: [
    {
      participant_id: 'npc:elin_harrow',
      unknown_label: 'the shaken woman',
      known_label: 'Elin',
    },
  ],
  entry_behavior: {
    mode: 'resume_or_start',
    opening_surface_id: 'surface_elin_guarded',
  },
  conversation_surface: {
    surface_id: 'surface_elin_guarded',
    paragraphs: [
      {
        kind: 'opening',
        text: 'The shaken woman keeps her voice low enough that the inn nearly swallows it.',
        source_visibility: 'player_visible',
      },
      {
        kind: 'tension',
        text: 'She answers when spoken to, but every mention of the road tightens her grip on the torn sash.',
        source_visibility: 'player_visible',
      },
    ],
  },
  passive_social_insight: [
    {
      insight_id: 'insight_elin_avoids_shrine',
      label: 'She avoids the shrine',
      target_id: 'npc:elin_harrow',
      requires_check: true,
      check: {
        mode: 'passive',
        ability: 'wisdom',
        skill: 'insight',
        dc: 14,
        visibility: 'success_only',
      },
      on_success: {
        text: 'Your Passive Insight catches the omission: she talks around the shrine, not through it.',
        knowledge_grants: ['elin_avoids_the_shrine'],
      },
      on_failure: {
        text: null,
      },
    },
  ],
  clarifying_questions: [
    {
      question_id: 'clarify_first_memory',
      label: 'What do you remember first?',
      target_id: 'npc:elin_harrow',
      requires_check: false,
      result: {
        text: 'She remembers sound first: a wheel cracking, then shouting from the trees.',
        summary: 'Elin remembers the wagon breaking before she remembers the attackers.',
      },
    },
    {
      question_id: 'clarify_bandit_reaction',
      label: 'Watch her reaction when bandits are mentioned',
      target_id: 'npc:elin_harrow',
      requires_check: true,
      check: {
        mode: 'standard',
        ability: 'wisdom',
        skill: 'insight',
        dc: 13,
        visibility: 'visible',
      },
      on_success: {
        text: 'She flinches at the word, but not with recognition. It sounds like a wrong answer to her.',
        knowledge_grants: ['bandits_not_full_explanation'],
      },
      on_failure: {
        text: 'She is frightened enough that every hard word makes her flinch.',
      },
      retry_policy: {
        immediate_retry: false,
      },
    },
  ],
  relationship_state_definitions: [
    {
      field: 'trust',
      scope: 'persistent_npc_state',
      type: 'ladder',
      values: [-2, -1, 0, 1, 2],
      default: 0,
      labels: {
        '-2': 'hostile',
        '-1': 'guarded',
        '0': 'uncertain',
        '1': 'warming',
        '2': 'trusting',
      },
      player_visibility: 'player_perceived',
    },
    {
      field: 'pressure',
      scope: 'dialogue_scene_state',
      type: 'number',
      default: 0,
      player_visibility: 'gm_only',
    },
  ],
  committed_social_moves: [
    {
      move_id: 'move_press_shrine_gently',
      label: 'Press gently about the shrine',
      social_move_type: 'press',
      social_tags: ['careful', 'truth-seeking'],
      tone: 'gentle',
      target_id: 'npc:elin_harrow',
      consumes_dialogue_beat: true,
      requires_check: true,
      check: {
        mode: 'standard',
        ability: 'charisma',
        skill: 'persuasion',
        dc: 14,
        visibility: 'visible',
      },
      preview: {
        text: 'You will spend the beat pressing Elin for what she is avoiding.',
      },
      relationship_reads: [
        {
          scope: 'persistent_npc_state',
          target_id: 'npc:elin_harrow',
          field: 'trust',
          operator: 'gte',
          value: -1,
        },
      ],
      on_success: {
        npc_response: 'She admits the attackers stopped when the shrine bell sounded.',
        result_summary: 'Elin connects the attack to the old shrine bell.',
        knowledge_grants: ['shrine_bell_stopped_attack'],
        relationship_writes: [
          {
            scope: 'persistent_npc_state',
            field: 'trust',
            operation: 'increment',
            value: 1,
            visibility: 'gm_and_player_perceived',
            reason: 'The player pressed gently rather than accusing her.',
          },
        ],
      },
      on_failure: {
        npc_response: 'She closes down and says she has already told you what she can.',
        result_summary: 'Elin withdraws from the question.',
        relationship_writes: [
          {
            scope: 'dialogue_scene_state',
            field: 'pressure',
            operation: 'increment',
            value: 1,
            visibility: 'gm_only',
            reason: 'The question pushed too quickly.',
          },
        ],
      },
    },
    {
      move_id: 'move_listen_without_pressing',
      label: 'Listen without pressing',
      social_move_type: 'listen',
      target_id: 'npc:elin_harrow',
      consumes_dialogue_beat: true,
      requires_check: false,
      preview: {
        text: 'You will spend the beat giving her room to speak without forcing the memory.',
      },
      no_check_result: {
        text: 'She does not add a new fact, but her breathing steadies and she stops looking at the door.',
        relationship_writes: [
          {
            scope: 'persistent_npc_state',
            field: 'trust',
            operation: 'set',
            value: 1,
            visibility: 'gm_and_player_perceived',
            reason: 'Patient listening makes her less guarded.',
          },
        ],
      },
    },
  ],
  generic_fallback: {
    enabled: true,
    usage_limit: 1,
    allowed_social_move_types: ['ask', 'listen', 'reassure'],
    excluded_social_move_types: ['force_confession', 'reveal_secret'],
    result_scope_constraints: {
      may_grant_major_clue: false,
      may_transition: false,
      may_write_relationship_state: false,
    },
    success_behavior: {
      text: 'She answers in fragments, but nothing moves beyond what she has already said.',
    },
    failure_behavior: {
      text: 'The question lands poorly and she retreats into silence.',
    },
    failed_fallback_consumes_slot: true,
  },
  dialogue_exits: [
    {
      exit_id: 'exit_return_to_inn',
      label: 'Let the conversation rest',
      exit_type: 'transition',
      behavior: {
        text: 'You let the memory settle and return your attention to the common room.',
      },
      transition: {
        target_type: 'exploration',
        target_id: 'grey_road_inn_common_room',
      },
    },
  ],
  summary_behavior: {
    mode: 'deterministic_authored',
    player_summary_template: 'Elin shared what she could remember without exposing hidden-only notes.',
  },
  validation_metadata: {
    profile: 'playtest_ready',
    test_path_id: 'elin_memory_basic_path',
  },
  debug_metadata: {
    owner: 'dialogue-build-tests',
  },
  completed_dialogue_record: {
    record_id: 'completed_elin_memory_template',
    template: true,
    player_facing_sources: [
      {
        source_id: 'surface_elin_guarded',
        visibility: 'player_visible',
      },
    ],
  },
  transcript_turns: [
    {
      turn_id: 'turn_surface_preview',
      turn_type: 'conversation_surface',
      visibility: 'player_visible',
      player_facing: true,
    },
  ],
  annotation_chains: [
    {
      annotation_id: 'ann_surface_safety',
      target_type: 'conversation_surface',
      target_id: 'surface_elin_guarded',
      review_status: 'approved',
      lifecycle_status: 'active',
      source_visibility: 'player_visible',
    },
  ],
  correction_chains: [
    {
      correction_id: 'corr_surface_wording',
      annotation_id: 'ann_surface_safety',
      target_type: 'conversation_surface',
      target_id: 'surface_elin_guarded',
      review_status: 'approved',
      lifecycle_status: 'active',
      source_visibility: 'player_visible',
    },
  ],
});

export function dialogueSceneFixture(overrides = {}) {
  return {
    ...cloneFixture(validMinimalDialogueScene),
    ...overrides,
  };
}
