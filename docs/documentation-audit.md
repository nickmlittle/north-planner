# Documentation inventory and cleanup proposal

Reviewed 9 November 2026. The [product and design specification](product-design-spec.md) is the entry point for future interface work. The proposed removals below are recommendations; files have not been deleted in this pass. Check external references and preserve useful evidence before removing them.

| File | Recommendation | Reason / prerequisite |
| --- | --- | --- |
| `README.md` | Keep | Setup, storage, migration and page-layout entry point; links to the durable guidance. |
| `docs/product-design-spec.md` | Keep | Product purpose, design direction and current interface patterns. |
| `docs/recurring-monthly-budget-rules.md` | Keep | Agreed financial contract, worked examples, compatibility and future shared-access decisions. Its historical audit section is time-specific. |
| `docs/transfer-calculation-rules.md` | Keep | Agreed calculation contract, examples, precision and unresolved cases. |
| `docs/plan-transfers-ux-implementation-plan.md` | Keep and label as roadmap | Contains substantial proposed and unfinished phases, including person-focused transfers, accessibility and rollout. It mixes aspirations with delivered work, so it must not be read as current behavior. Review each phase before closing or removing it. |
| `PLAN.MD` | Candidate for removal | A past mobile redesign plan whose core patterns are reflected in the app and the new guide. Before removal, reconcile its acceptance criteria with current behavior and carry any remaining requirements into the roadmap. |
| `docs/plan-scan-phase-2-1-review.md` | Candidate for removal | Dated implementation review; durable mobile Plan decisions are summarized in the specification. Preserve any useful device-test evidence in the validation record or roadmap first. |
| `docs/plan-search-phase-2-2-review.md` | Candidate for removal | Search behavior is summarized in the specification; its dated verification details are historical. Preserve any still-relevant test limitations first. |
| `docs/plan-transfers-baseline-audit.md` | Candidate for removal after extracting method | Contains unique synthetic task timings, observations and fixture instructions, but its snapshot predates later changes and can mislead as current behavior. If comparison with the baseline is still useful, retain the measurements and reproduction method in a clearly dated test record before deletion. Update the README link. |
| `docs/fixtures/plan-transfers-baseline.json` | Keep | Synthetic fixture used by tests and visual review, independently of the audit document. |

The two financial contracts currently link to the roadmap for historical provenance; keep those links valid if the roadmap is reorganized. Audit relative links and test/script references after any removal. Do not delete the fixture or its generator merely because the baseline audit is eventually removed.
