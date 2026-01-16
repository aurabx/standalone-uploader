# Standalone Auraloader

A standalone DICOM uploader component for embedding in external applications. This package provides a complete, self-contained upload widget that handles DICOM file processing, validation, zipping, and upload via Tus protocol.

## Features

- 🔬 DICOM file parsing and validation
- 📦 Automatic file zipping for efficient uploads
- 📊 Study/series metadata extraction
- 🚀 Tus protocol for resumable uploads
- 🎨 Self-contained UI with no framework dependencies
- 🔐 Token-based authentication
- 📱 Responsive design

## Installation

### Via npm/pnpm

```bash
pnpm add @aurabx/standalone-uploader
```

### Via script tag

```html
<!-- All CSS is bundled - no external stylesheets required -->
<script src="https://your-cdn.com/standalone-auraloader.umd.js"></script>
```

## Usage

### ES Module

```javascript
import { StandaloneAuraloader } from '@aurabx/standalone-uploader';

const uploader = new StandaloneAuraloader({
  apiToken: 'your-api-token',
  apiBaseUrl: 'https://aura-instance.com/api',
  containerId: 'uploader-container',
  callbacks: {
    onUploadComplete: (result) => {
      console.log('Upload complete!', result);
    },
    onUploadError: (error) => {
      console.error('Upload failed:', error);
    },
  }
});

await uploader.init();
await uploader.mount();
```

### Script Tag (UMD)

```html
<div id="uploader"></div>

<script src="standalone-auraloader.umd.js"></script>
<script>
  const uploader = new StandaloneAuraloader({
    apiToken: 'your-api-token',
    apiBaseUrl: 'https://aura-instance.com/api',
    containerId: 'uploader',
    callbacks: {
      onUploadComplete: (result) => console.log('Complete!', result),
      onUploadError: (error) => console.error('Error:', error),
    }
  });

  uploader.init().then(() => uploader.mount());
</script>
```

## Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiToken` | `string` | Yes | API token for authentication |
| `apiBaseUrl` | `string` | Yes | Base URL for the Aura API |
| `containerId` | `string` | Yes | ID of the container element |
| `callbacks` | `object` | No | Event callbacks |

### Callbacks

```typescript
interface Callbacks {
  onUploadComplete?: (result: UploadResult) => void;
  onUploadError?: (error: AuraloaderError) => void;
  onUploadCancel?: () => void;
  onStudiesFound?: (studies: StudyInfo[]) => void;
  onStateChange?: (state: UploaderState) => void;
}
```

## API

### Methods

| Method | Description |
|--------|-------------|
| `init()` | Initialize the uploader (fetches config from server) |
| `mount()` | Mount the UI to the DOM |
| `upload()` | Start the upload process |
| `cancel()` | Cancel the current upload |
| `reset()` | Reset to initial state |
| `removeStudy(uid)` | Remove a study from the queue |
| `destroy()` | Cleanup and unmount |

## Backend Requirements

The standalone uploader requires backend endpoints in Aura:

- `GET /api/standalone/config` - Returns upload configuration
- `POST /api/standalone/upload/init` - Initialize upload session
- `POST /api/standalone/upload/start` - Mark upload as started
- `POST /api/standalone/upload/complete` - Mark upload as complete
- `POST /api/standalone/upload/error` - Report upload error
- `POST /api/standalone/upload/cancel` - Cancel upload

These endpoints use token-based authentication via the `standalone.api` middleware.

## Development

```bash
# Install dependencies
pnpm install

# Run typecheck
pnpm typecheck

# Build
pnpm build

# Dev server (for examples)
pnpm dev
```

## License

UNLICENSED - Proprietary software
