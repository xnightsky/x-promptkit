# recall-eval scripts

These scripts support the `recall-eval` skill without requiring `iitest`.

Commands:

- `npm run recall:validate -- <yaml-path>`
- `npm run recall:resolve -- <yaml-path>`
- `npm run recall:run -- <yaml-path> --case <id> --answer "<text>"`

Responsibilities:

- `validate-schema.mjs`: schema and integrity validation
- `resolve-target.mjs`: inspect effective `source_ref`
- `run-eval.mjs`: score answers against queue rules and print the fixed five-section report
