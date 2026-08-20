# Impact Engine v1

Impact Engine re-evaluates downstream travel plans when a confirmed item changes. It works without live-flight data; manual/imported schedule changes can trigger it.

## Impact types
- TIME_IMPACT
- LOCATION_IMPACT
- STATUS_IMPACT
- DOCUMENT_IMPACT
- CONNECTION_IMPACT
- OFFLINE_IMPACT

## Evaluation
Use explicit connections first, then chronological adjacency where safe. Generate an assessment version and aggregate related alerts. Alerts may be critical/high/medium/low/info.

## Language
Never say `you will make it`. Prefer `comfortable`, `tight`, `unlikely`, `unknown`, with the basis for the assessment.
