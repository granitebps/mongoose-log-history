# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-05-30

### Added

- `logConnection` option on `PluginOptions`, `getLogHistoryModel()`, and `pruneLogHistory()` to route log history writes, reads, and pruning to a separate Mongoose connection.
- Warning when configured fields (`trackedFields`, `contextFields`, `userField`, `softDelete.field`) are not present in the Mongoose schema. Warning is skipped when strict mode is disabled.

### Fixed

- `ObjectId` fields in `original_doc` and `updated_doc` were serialized as `{ buffer: { '0': ..., '1': ... } }` plain objects when `saveWholeDoc: true`. They are now stored as proper BSON `ObjectId` instances.
- `contextFields`, `userField`, and `softDelete.field` were not selected in query hooks when not also listed in `trackedFields`, causing them to be missing from logs.
- Prototype pollution vulnerability in `setByPath` — `__proto__` and `constructor.prototype` traversal are now blocked. Safe field names like `constructor` and `prototype` as regular nested keys continue to work.

## [1.1.0] - 2025-10-27

### Changed

- Migrate codebase to TypeScript

### Added

- Support for string and number types for `modelId` field
- Support for embedded dot notation fields

## [1.0.1] - 2025-08-03

### Added

- Add example folder
- Add test folder

### Fixed

- Fix `Duplicate schema index` warning

## [1.0.0] - 2025-06-15

### Added

- Initial release of `mongoose-log-history` plugin.
- Field-level change tracking for create, update, delete, and soft delete.
- Batch operation support.
- Contextual logging and custom logger support.
- Pruning utility and compression support.
- Discriminator support.
- Exposed internal helpers for manual logging.
- First stable release.

---

[Unreleased]: https://github.com/granitebps/mongoose-log-history/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/granitebps/mongoose-log-history/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/granitebps/mongoose-log-history/releases/tag/v1.1.0
[1.0.1]: https://github.com/granitebps/mongoose-log-history/releases/tag/v1.0.1
[1.0.0]: https://github.com/granitebps/mongoose-log-history/releases/tag/v1.0.0
