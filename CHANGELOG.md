# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-08-20

### Added
- Determinate progress UI for the file-processing step: phase label, `current / total` counter, progress bar, live tally of accepted / skipped / unreadable files, and an expandable list of the first ten unreadable files with reasons
- Cancel button during processing that aborts the parsing loop and returns to the drop zone
- Stall watchdog that surfaces a "Still working — large files can take a while" hint after 20 seconds without progress
- New `ProcessPhase`, `ProcessOutcome`, and `ProcessProgress` types exported from the public API; new processing fields on `UploaderState`
- New DOM events on the container element: `sal:cancelProcessing`, `sal:toggleProcessingErrors`
- Comprehensive test suite with Vitest + happy-dom (186 tests, ~98% line coverage) and `test` / `test:watch` / `coverage` npm scripts

### Changed
- `AuraloaderEngine.process()` now accepts an `onProgress` callback, classifies each file (accepted / skipped / rejected / failed), and yields to the browser every 25 files so the UI can repaint and cancel stays responsive
- Processing no longer waits an artificial 500 ms before starting
- When every selected file is skipped, rejected, or unreadable the uploader routes to an explicit error state with a clear message instead of the empty "no images" screen

### Fixed
- Files larger than ~2 GB no longer fail with `NotReadableError` during DICOM parsing. `readDicom` now reads only the first 20 MB of a file and parses up to the PixelData tag, which is enough for metadata extraction; the full file is still uploaded in chunks by tus

## [1.0.1] - 2026-04-22

### Changed
- Refreshed uploader UI styling
- Success and error messages now render as proper icon banners
- Completed-upload view replaces the filled progress bar with a success banner and subtle "Add more" link instead of a full-width button
- Pause and cancel buttons in the StatusBar now have proper padding, backgrounds, and hover/focus states
- Study cards gained a subtle shadow and hover state
- Primary buttons gained a focus ring and refined shadow

## [0.1.0] - 2025-01-25

### Added
- Initial release of the standalone DICOM uploader component
- Secure two-phase authentication flow (HMAC → upload token exchange)
- Complete DICOM file processing and validation pipeline
- Resumable uploads via Tus protocol
- File zipping and compression for efficient uploads
- Drag-and-drop interface with progress tracking
- Comprehensive error handling and state management
- TypeScript support with full type definitions
- Both ES modules and UMD bundle distribution
- Inline CSS injection - no external stylesheets required
- HMAC signer utilities for backend token exchange
- Complete API documentation and integration examples
- Working HTML example demonstrating full authentication flow

### Security Features
- HMAC-based authentication with ephemeral upload tokens
- Token scope limitations and rate limiting
- Secure header handling and request signing
- Input validation and sanitization throughout

### API Endpoints Supported
- `POST /auth/exchange` - Token exchange (backend only)
- `GET /uploader/config` - Upload configuration
- `POST /uploader/upload/init` - Initialize upload session
- `POST /uploader/upload/start` - Mark upload started
- `POST /uploader/upload/complete` - Mark upload complete
- `POST /uploader/upload/error` - Report upload errors
- `POST /uploader/upload/cancel` - Cancel upload

### Browser Support
- Modern browsers with ES2022 support
- File API and Blob support
- Fetch API and async/await
- CSS Grid and Flexbox

### Dependencies
- @uppy/core for file upload management
- dicom-parser for DICOM file processing
- @zip.js/zip.js for file compression
- axios for HTTP requests
- uuid for unique identifier generation

---

## Development

### Build System
- Vite for bundling and build optimization
- TypeScript for type safety
- CSS injection plugin for self-contained bundles

### Testing
- Unit tests for HMAC signing functionality
- Crypto utilities validation

---

**License: UNLICENSED - Proprietary software**