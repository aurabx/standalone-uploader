# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- `POST /standalone/auth/exchange` - Token exchange (backend only)
- `GET /standalone/config` - Upload configuration
- `POST /standalone/upload/init` - Initialize upload session
- `POST /standalone/upload/start` - Mark upload started
- `POST /standalone/upload/complete` - Mark upload complete
- `POST /standalone/upload/error` - Report upload errors
- `POST /standalone/upload/cancel` - Cancel upload

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