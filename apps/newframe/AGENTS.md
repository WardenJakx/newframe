<important if="changing persisted canonical state schemas, persistence versions, migrations, hydration, or quarantine behavior">
Persisted-state changes must be backward-safe.

- Land the schema, version bump, migration, and tests atomically.
- Never change an already-written persistence version's meaning. If any build may have written version N, further incompatible changes require version N+1 with an N-to-N+1 migration.
- Validate migrated data against the new schema before writing it.
- Preserve valid durable state when individual records are incompatible; prefer record-level migration or quarantine over rejecting the entire envelope.
- Never delete or overwrite the source until a recovery copy has been written, read back, and validated.
- Quarantine data outside the key being deleted; never create a recovery key beneath its parent.
- Migration or hydration failure must leave the original state untouched and must not persist an empty replacement.
- Test every supported prior version, intermediate-version data, idempotent migration, mixed valid and invalid records, and quarantine failure.
- Use an isolated user-data directory for schema-changing builds and harnesses. Never launch them against the shared `Newframe dev` profile without explicit authorization and a verified backup.

</important>
