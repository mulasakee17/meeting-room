# Humanize Check Report

- Matrix path: `paper_rewriting_output\humanize_matrix.md`
- Humanize tier: light
- Matrix rows: 4
- Manuscript paragraphs: 112
- Coverage: 4%
- Sentence length stddev: 28.29
- Connector density: 0.52/1k chars
- Status: PASS

## Dimension Scores

### D1 sentence structure: WARNING [required]
- Metrics: sentence_count=638, length_stddev=28.45, sentence_length_cv=0.749, repeated_start_ratio=0.27, uniform_length_runs=18, short_sentence_ratio=0.31, long_sentence_ratio=0.08
- Affected units: S34-S36, S66-S68, S67-S69, S79-S81, S80-S82
- D1 consecutive sentences have near-identical lengths: ['S34-S36', 'S66-S68', 'S67-S69', 'S79-S81', 'S80-S82'].

### D2 paragraph similarity: WARNING [advisory]
- Metrics: paragraph_count=112, max_4gram_count=7, repeated_4gram_ratio=0.0561, paragraph_length_stddev=180.71, repeated_opening_ratio=0.11, min_paragraph_length=51, max_paragraph_length=1475, adjacent_paragraph_similarity_mean=0.133, adjacent_paragraph_similarity_max=0.5
- D2 repeated 4-gram found 7 occurrences of same phrase — consider rephrasing.

### D3 information density: PASS [advisory]
- Metrics: generic_phrase_density=0.0, information_anchor_density=16.0, generic_phrase_count=0, anchor_count=349, mechanism_term_count=52, ttr=0.5845, token_count=4708, unique_token_count=2752
- No dimension-specific risk found.

### D4 connector frequency: PASS [required]
- Metrics: connector_count=13, connector_density=0.52, max_paragraph_connector_density=13.89
- No dimension-specific risk found.

### D5 term-context matching: PASS [advisory]
- Metrics: frequent_terms_checked=12, contexts_checked=96, generic_context_ratio=0.0, mechanism_contexts=67, risky_terms=
- No dimension-specific risk found.

## Required Findings

- None

## Advisory Findings

- Coverage 4%: 4 rows for 112 paragraphs. Minimum 50%.
- D1 consecutive sentences have near-identical lengths: ['S34-S36', 'S66-S68', 'S67-S69', 'S79-S81', 'S80-S82'].
- D2 repeated 4-gram found 7 occurrences of same phrase — consider rephrasing.

## Threshold Profile

- adjacent_similarity_max_fail: 0.65
- adjacent_similarity_mean_warning: 0.45
- max_4gram_count_warning: 5
- max_connector_density: 8
- max_generic_density: 7
- max_paragraph_connector_density: 14
- max_repeated_start_ratio: 0.35
- max_term_generic_context_ratio: 0.45
- min_info_anchor_density: 2.5
- min_paragraph_length_stddev: 25
- min_sentence_length_stddev: 6
- repeated_4gram_ratio_fail: 0.15
- repeated_4gram_ratio_warning: 0.08
- sentence_length_cv_fail: 0.25
- sentence_length_cv_warning: 0.35
- ttr_fail_en: 0.25
- ttr_fail_zh: 0.35
- ttr_warning_en: 0.32
- ttr_warning_zh: 0.42
