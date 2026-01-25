/**
 * Standalone Auraloader - Embeddable DICOM Uploader Component
 *
 * A standalone, embeddable DICOM uploader that can be integrated into any
 * web application. Handles file selection, DICOM parsing, and secure uploads
 * to the Aura platform.
 *
 * @remarks
 * ## Authentication Flow
 *
 * This component uses ephemeral upload tokens for authentication. The recommended
 * integration pattern is:
 *
 * 1. **Backend**: Use `@aurabx/uploader-client` to exchange HMAC credentials for
 *    an upload token (server-side only - NEVER expose HMAC secrets to browsers)
 *
 * 2. **Frontend**: Pass the upload token to this component for secure uploads
 *
 * ```typescript
 * // Your backend (Node.js) - uses @aurabx/uploader-client
 * const client = new AuraUploaderClient({ appId, appSecret, apiKey, baseUrl });
 * const { token } = await client.exchangeToken();
 * // Send 'token' to your frontend
 *
 * // Your frontend - uses @aurabx/standalone-uploader
 * const uploader = new StandaloneAuraloader({
 *   apiToken: 'your-api-key',
 *   apiBaseUrl: 'https://api.aura.example.com',
 *   uploadToken: token, // From your backend
 *   containerId: 'uploader',
 * });
 * ```
 *
 * @packageDocumentation
 */

import type { AuraloaderConfig, StudyInfo, UploadResult } from "./types";
import { ApiClient } from "./api/client";
import { AuraloaderEngine } from "./core/AuraloaderEngine";
import { Store } from "./ui/Store";
import { Renderer } from "./ui/Renderer";
import { HmacSigner, createSigner } from "./hmac";

export * from "./types";

/**
 * HMAC signing utilities - DEMO/DEVELOPMENT USE ONLY.
 *
 * In production, use `@aurabx/uploader-client` on your server to handle
 * HMAC credential exchange. Never expose HMAC secrets to browsers.
 *
 * @see {@link https://github.com/aurabx/uploader-client}
 */
export * from "./hmac";

/**
 * StandaloneAuraloader - A standalone DICOM uploader component.
 *
 * @example
 * ```javascript
 * const uploader = new StandaloneAuraloader({
 *   apiToken: 'your-api-token',
 *   apiBaseUrl: 'https://aura-instance.com/api',
 *   containerId: 'uploader-container',
 *   callbacks: {
 *     onUploadComplete: (result) => console.log('Complete!', result),
 *     onUploadError: (error) => console.error('Error:', error),
 *   }
 * });
 *
 * await uploader.init();
 * await uploader.mount();
 * ```
 */
export class StandaloneAuraloader {
  private config: AuraloaderConfig;
  private apiClient: ApiClient;
  private engine: AuraloaderEngine | null = null;
  private store: Store;
  private renderer: Renderer | null = null;
  private initialized = false;

  constructor(config: AuraloaderConfig) {
    this.validateConfig(config);
    this.config = config;
    // Pass upload token for authentication
    this.apiClient = new ApiClient(
      config.apiBaseUrl,
      config.apiToken,
      config.uploadToken
    );
    this.store = new Store(config.callbacks);
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: AuraloaderConfig): void {
    if (!config.apiToken) {
      throw new Error("apiToken is required");
    }
    if (!config.apiBaseUrl) {
      throw new Error("apiBaseUrl is required");
    }
    if (!config.containerId) {
      throw new Error("containerId is required");
    }
    if (!config.uploadToken) {
      throw new Error("uploadToken is required");
    }

    // Validate URL format
    try {
      new URL(config.apiBaseUrl);
    } catch {
      throw new Error("apiBaseUrl must be a valid URL");
    }

    // Validate upload token format
    if (!config.uploadToken.startsWith("aubt_")) {
      throw new Error("uploadToken must start with 'aubt_'");
    }
  }

  /**
   * Validate server configuration response
   */
  private validateServerConfig(
    config: import("./types").UploaderConfigResponse
  ): void {
    if (!config.lift) {
      throw new Error("Server config missing lift configuration");
    }

    if (!config.lift.endpoint) {
      throw new Error("Server config missing or invalid lift.endpoint");
    }

    if (!config.lift.token ) {
      throw new Error("Server config missing or invalid lift.token");
    }

    if (!config.lift.bucket) {
      throw new Error("Server config missing or invalid lift.bucket");
    }

    if (!config.mode) {
      throw new Error("Server config missing or invalid mode");
    }
  }

  /**
   * Validate container element exists in DOM
   */
  private validateContainer(): void {
    const container = document.getElementById(this.config.containerId);
    if (!container) {
      throw new Error(
        `Container element with id "${this.config.containerId}" not found in DOM`
      );
    }

    // Check if container is suitable for mounting
    if (container.children.length > 0) {
      console.warn(
        `Container "${this.config.containerId}" is not empty. Existing content will be replaced.`
      );
    }
  }

  /**
   * Validate endpoint connectivity.
   * Upload token handles authentication automatically on each request.
   */
  private async validateEndpoint(): Promise<void> {
    try {
      // Test basic connectivity - upload token auth happens automatically
      await this.apiClient.getConfig();
    } catch (error) {
      if (ApiClient.isAuthError(error)) {
        throw new Error("Authentication failed. Check your upload token.");
      }

      throw new Error(
        `Server connectivity failed: ${ApiClient.getErrorMessage(error)}`
      );
    }
  }

  /**
   * Initialize the uploader.
   * Fetches configuration from the server and sets up the engine.
   */
  async init(): Promise<void> {
    if (this.initialized) {
      console.warn("StandaloneAuraloader already initialized");
      return;
    }

    try {
      // Validate container exists before proceeding
      this.validateContainer();

      // Validate endpoint connectivity and app credentials before proceeding
      await this.validateEndpoint();

      // Fetch uploader configuration from server
      const serverConfig = await this.apiClient.getConfig();

      // Validate server config response
      this.validateServerConfig(serverConfig);

      // Create renderer first to get target selectors
      this.renderer = new Renderer(this.config.containerId, this.store);

      // Create engine with server config
      this.engine = new AuraloaderEngine({
        dragDrop: {
          target: this.renderer.getDragDropTarget(),
          width: "100%",
          height: "100%",
          locale: {
            strings: {
              dropHereOr: "Drag and drop DICOM files here or %{browse}",
              browse: "browse",
            },
          },
        },
        statusBar: {
          target: this.renderer.getProgressTarget(),
          hideUploadButton: true,
          hideAfterFinish: false,
          showProgressDetails: true,
        },
        lift: serverConfig.lift,
        mode: serverConfig.mode || "uploader",
      });

      // Setup Tus
      await this.engine.setup();

      // Wire up engine events
      this.setupEngineEvents();

      this.initialized = true;
      console.debug("StandaloneAuraloader initialized");
    } catch (error) {
      console.error("Failed to initialize StandaloneAuraloader:", error);
      throw error;
    }
  }

  /**
   * Mount the UI to the DOM
   */
  async mount(): Promise<void> {
    if (!this.initialized) {
      throw new Error("Must call init() before mount()");
    }

    if (!this.renderer) {
      throw new Error("Renderer not initialized");
    }

    // Set up render callback to remount Uppy plugins after DOM updates
    this.renderer.onRender((state) => {
      if (this.engine) {
        // Remount DragDrop if target exists
        if (state.step === "start" || state.step === "pending") {
          this.engine.mountDragDrop();
        }
        // Remount StatusBar if target exists
        if (state.step === "uploading") {
          this.engine.mountStatusBar();
        }
      }
    });

    this.renderer.mount();
    this.setupUIEvents();

    console.debug("StandaloneAuraloader mounted");
  }

  /**
   * Setup engine event handlers
   */
  private setupEngineEvents(): void {
    if (!this.engine) return;

    // Files added
    this.engine.uppy.on("files-added", async (files) => {
      const zipFiles = files.filter((file) => file.type === "application/zip");

      if (zipFiles.length === files.length && files.length > 0) {
        console.warn("ZIP files detected - skipping processing");
        return;
      }

      this.store.goto("processing");

      setTimeout(async () => {
        await this.engine?.process();
        this.buildSummary();
        this.store.goto("pending");
      }, 500);
    });

    // Upload started
    this.engine.uppy.on("upload", async (uploadID) => {
      console.debug("Upload started:", uploadID);
      try {
        await this.apiClient.uploadStart({
          upload_id: this.engine?.uniqueId || "",
          assembly_id: uploadID,
          mode: "uploader",
        });
      } catch (error) {
        console.error("Failed to notify upload start:", error);
        this.store.setError(ApiClient.getErrorMessage(error));
      }
    });

    // Upload complete
    this.engine.uppy.on("complete", async (result) => {
      console.debug("Upload complete:", result);
      try {
        const assemblyId = (result as { uploadID?: string }).uploadID || "";

        await this.apiClient.uploadComplete({
          upload_id: this.engine?.uniqueId || "",
          assembly_id: assemblyId,
          mode: "uploader",
        });

        this.store.setComplete(true);
        this.isUploading = false;

        // Notify callback
        this.config.callbacks?.onUploadComplete?.({
          uploadId: this.engine?.uniqueId || "",
          studies: [],
          successful: result.successful?.length || 0,
          failed: result.failed?.length || 0,
        });
      } catch (error) {
        console.error("Failed to notify upload complete:", error);
        this.store.setError(ApiClient.getErrorMessage(error));
        this.isUploading = false;
      }
    });

    // Upload error
    this.engine.uppy.on("upload-error", async (file, error, response) => {
      console.error("Upload error:", { file, error, response });

      const statusCode = (response as { status?: number })?.status;

      if (statusCode === 401) {
        this.store.setError(
          "Authentication failed. Please refresh and try again."
        );
      } else if (statusCode === 403) {
        this.store.setError("Permission denied. Contact your administrator.");
      } else {
        this.store.setError(error?.message || "Upload failed");
      }
    });

    // Engine error
    this.engine.uppy.on("error", async (error) => {
      console.error("Engine error:", error);
      try {
        await this.apiClient.uploadError({
          upload_id: this.engine?.uniqueId || "",
          message: error.message,
          mode: "uploader",
        });
      } catch (apiError) {
        console.error("Failed to report error:", apiError);
      }

      await this.engine?.reset();
      this.store.setError(error.message);
    });

    // Cancel - only handle if we're in an upload state
    this.engine.uppy.on("cancel-all", async () => {
      const currentStep = this.store.getState().step;
      // Only handle cancel if we're actually uploading
      if (currentStep !== "uploading") {
        console.debug("Cancel-all triggered during non-upload state, ignoring");
        return;
      }

      console.debug("Upload cancelled");
      this.store.goto("cancelled");
      this.isUploading = false;

      try {
        await this.apiClient.uploadCancel({
          upload_id: this.engine?.uniqueId || "",
          mode: "uploader",
        });
      } catch (error) {
        console.error("Failed to notify cancel:", error);
      }

      this.config.callbacks?.onUploadCancel?.();
    });
  }

  /**
   * Setup UI event handlers
   */
  private setupUIEvents(): void {
    const container = document.getElementById(this.config.containerId);
    if (!container) return;

    // Remove study
    container.addEventListener("sal:removeStudy", async (e: Event) => {
      const { uid } = (e as CustomEvent).detail;
      await this.removeStudy(uid);
    });

    // Upload
    container.addEventListener("sal:upload", () => {
      this.upload();
    });

    // Cancel (before upload)
    container.addEventListener("sal:cancel", () => {
      this.config.callbacks?.onUploadCancel?.();
    });

    // Cancel upload (during upload)
    container.addEventListener("sal:cancelUpload", () => {
      this.cancel();
    });

    // Reset
    container.addEventListener("sal:reset", () => {
      this.reset();
    });

    // Done
    container.addEventListener("sal:done", () => {
      // User dismissed the complete state
      const state = this.store.getState();
      this.config.callbacks?.onUploadComplete?.({
        uploadId: this.engine?.uniqueId || "",
        studies: [],
        successful: state.totalFiles,
        failed: 0,
      });
    });
  }

  /**
   * Build summary from processed files
   */
  private buildSummary(): void {
    if (!this.engine) return;

    this.store.setSummary({
      totalFiles: this.engine.totalFiles,
      seriesCount: this.engine.seriesCount,
      studiesCount: this.engine.studiesCount,
      studies: this.engine.studiesInfo,
    });
  }

  private isUploading = false;

  /**
   * Start the upload process
   */
  async upload(): Promise<void> {
    if (!this.engine) {
      throw new Error("Engine not initialized");
    }

    // Prevent multiple upload calls
    if (this.isUploading) {
      console.debug("Upload already in progress, ignoring");
      return;
    }
    this.isUploading = true;

    this.store.goto("uploading");

    try {
      // Initialize upload on server
      // Note: Authentication handled via upload token in API client
      const result = await this.apiClient.uploadInit({
        upload_id: this.engine.uniqueId,
        studies: this.engine.studiesInfo,
        mode: "uploader",
        source: "standalone-uploader",
        patient_id: this.config.patientId,
        context: this.config.context,
      });

      if (result.studies?.length) {
        this.store.setStudiesFromApi(result.studies);
      }

      // Zip files
      this.store.setZipping(true);
      await this.engine.zipFiles();
      this.store.setZipping(false);

      // Start upload
      await this.engine.uppy.upload();
    } catch (error) {
      console.error("Upload failed:", error);
      // Log full response for debugging
      if ((error as { response?: { data?: unknown } })?.response?.data) {
        console.error(
          "Server response:",
          (error as { response: { data: unknown } }).response.data
        );
      }
      this.store.setError(ApiClient.getErrorMessage(error));
      this.isUploading = false;
    }
  }

  /**
   * Cancel the current upload
   */
  async cancel(): Promise<void> {
    if (!this.engine) return;
    this.engine.uppy.cancelAll();
  }

  /**
   * Reset the uploader to initial state
   */
  async reset(): Promise<void> {
    if (!this.engine) return;

    await this.engine.setup();
    await this.engine.reset();
    this.store.reset();
  }

  /**
   * Remove a study from the upload queue
   */
  async removeStudy(uid: string): Promise<void> {
    if (!this.engine) return;

    await this.engine.removeStudy(uid);
    this.buildSummary();
  }

  /**
   * Unmount and cleanup
   */
  destroy(): void {
    this.renderer?.unmount();
    this.engine?.uppy.cancelAll();
    this.initialized = false;
  }
}

// Export for UMD bundle
if (typeof window !== "undefined") {
  const w = window as any;
  w.StandaloneAuraloader = StandaloneAuraloader;
  // Export HMAC utilities for DEMO/DEVELOPMENT only
  // WARNING: In production, use @aurabx/uploader-client on your server
  w.HmacSigner = HmacSigner;
  w.createSigner = createSigner;
}

export default StandaloneAuraloader;
