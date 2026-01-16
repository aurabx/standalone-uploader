import type { AuraloaderConfig, StudyInfo, UploadResult } from './types';
import { ApiClient } from './api/client';
import { AuraloaderEngine } from './core/AuraloaderEngine';
import { Store } from './ui/Store';
import { Renderer } from './ui/Renderer';

export * from './types';

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
    this.apiClient = new ApiClient(config.apiBaseUrl, config.apiToken);
    this.store = new Store(config.callbacks);
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: AuraloaderConfig): void {
    if (!config.apiToken) {
      throw new Error('apiToken is required');
    }
    if (!config.apiBaseUrl) {
      throw new Error('apiBaseUrl is required');
    }
    if (!config.containerId) {
      throw new Error('containerId is required');
    }
  }

  /**
   * Initialize the uploader.
   * Fetches configuration from the server and sets up the engine.
   */
  async init(): Promise<void> {
    if (this.initialized) {
      console.warn('StandaloneAuraloader already initialized');
      return;
    }

    try {
      // Fetch uploader configuration from server
      const serverConfig = await this.apiClient.getConfig();

      // Create renderer first to get target selectors
      this.renderer = new Renderer(this.config.containerId, this.store);

      // Create engine with server config
      this.engine = new AuraloaderEngine({
        dragDrop: {
          target: this.renderer.getDragDropTarget(),
          width: '100%',
          height: '100%',
          locale: {
            strings: {
              dropHereOr: 'Drag and drop DICOM files here or %{browse}',
              browse: 'browse',
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
        mode: serverConfig.mode || 'standalone',
      });

      // Setup Tus
      await this.engine.setup();

      // Wire up engine events
      this.setupEngineEvents();

      this.initialized = true;
      console.debug('StandaloneAuraloader initialized');
    } catch (error) {
      console.error('Failed to initialize StandaloneAuraloader:', error);
      throw error;
    }
  }

  /**
   * Mount the UI to the DOM
   */
  async mount(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Must call init() before mount()');
    }

    if (!this.renderer) {
      throw new Error('Renderer not initialized');
    }

    this.renderer.mount();
    this.setupUIEvents();

    // Re-initialize engine plugins after renderer mounts
    // (because targets now exist in the DOM)
    if (this.engine) {
      await this.engine.setup();
    }

    console.debug('StandaloneAuraloader mounted');
  }

  /**
   * Setup engine event handlers
   */
  private setupEngineEvents(): void {
    if (!this.engine) return;

    // Files added
    this.engine.uppy.on('files-added', async (files) => {
      const zipFiles = files.filter((file) => file.type === 'application/zip');
      
      if (zipFiles.length === files.length && files.length > 0) {
        console.warn('ZIP files detected - skipping processing');
        return;
      }

      this.store.goto('processing');

      setTimeout(async () => {
        await this.engine?.process();
        this.buildSummary();
        this.store.goto('pending');
      }, 500);
    });

    // Upload started
    this.engine.uppy.on('upload', async (uploadID) => {
      console.debug('Upload started:', uploadID);
      try {
        await this.apiClient.uploadStart({
          upload_id: this.engine?.uniqueId || '',
          assembly_id: uploadID,
          mode: 'standalone',
        });
      } catch (error) {
        console.error('Failed to notify upload start:', error);
        this.store.setError(ApiClient.getErrorMessage(error));
      }
    });

    // Upload complete
    this.engine.uppy.on('complete', async (result) => {
      console.debug('Upload complete:', result);
      try {
        const assemblyId = (result as { uploadID?: string }).uploadID || '';

        await this.apiClient.uploadComplete({
          upload_id: this.engine?.uniqueId || '',
          assembly_id: assemblyId,
          mode: 'standalone',
        });

        this.store.setComplete(true);

        // Notify callback
        this.config.callbacks?.onUploadComplete?.({
          uploadId: this.engine?.uniqueId || '',
          studies: [],
          successful: result.successful?.length || 0,
          failed: result.failed?.length || 0,
        });
      } catch (error) {
        console.error('Failed to notify upload complete:', error);
        this.store.setError(ApiClient.getErrorMessage(error));
      }
    });

    // Upload error
    this.engine.uppy.on('upload-error', async (file, error, response) => {
      console.error('Upload error:', { file, error, response });
      
      const statusCode = (response as { status?: number })?.status;
      
      if (statusCode === 401) {
        this.store.setError('Authentication failed. Please refresh and try again.');
      } else if (statusCode === 403) {
        this.store.setError('Permission denied. Contact your administrator.');
      } else {
        this.store.setError(error?.message || 'Upload failed');
      }
    });

    // Engine error
    this.engine.uppy.on('error', async (error) => {
      console.error('Engine error:', error);
      try {
        await this.apiClient.uploadError({
          upload_id: this.engine?.uniqueId || '',
          message: error.message,
          mode: 'standalone',
        });
      } catch (apiError) {
        console.error('Failed to report error:', apiError);
      }

      await this.engine?.reset();
      this.store.setError(error.message);
    });

    // Cancel
    this.engine.uppy.on('cancel-all', async () => {
      console.debug('Upload cancelled');
      this.store.goto('cancelled');

      try {
        await this.apiClient.uploadCancel({
          upload_id: this.engine?.uniqueId || '',
          mode: 'standalone',
        });
      } catch (error) {
        console.error('Failed to notify cancel:', error);
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
    container.addEventListener('sal:removeStudy', async (e: Event) => {
      const { uid } = (e as CustomEvent).detail;
      await this.removeStudy(uid);
    });

    // Upload
    container.addEventListener('sal:upload', () => {
      this.upload();
    });

    // Cancel (before upload)
    container.addEventListener('sal:cancel', () => {
      this.config.callbacks?.onUploadCancel?.();
    });

    // Cancel upload (during upload)
    container.addEventListener('sal:cancelUpload', () => {
      this.cancel();
    });

    // Reset
    container.addEventListener('sal:reset', () => {
      this.reset();
    });

    // Done
    container.addEventListener('sal:done', () => {
      // User dismissed the complete state
      const state = this.store.getState();
      this.config.callbacks?.onUploadComplete?.({
        uploadId: this.engine?.uniqueId || '',
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

  /**
   * Start the upload process
   */
  async upload(): Promise<void> {
    if (!this.engine) {
      throw new Error('Engine not initialized');
    }

    this.store.goto('uploading');

    try {
      // Initialize upload on server
      const result = await this.apiClient.uploadInit({
        upload_id: this.engine.uniqueId,
        studies: Object.values(this.engine.studiesInfo),
        mode: 'standalone',
        source: 'standalone-uploader',
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
      console.error('Upload failed:', error);
      this.store.setError(ApiClient.getErrorMessage(error));
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
if (typeof window !== 'undefined') {
  (window as Window & { StandaloneAuraloader?: typeof StandaloneAuraloader }).StandaloneAuraloader = StandaloneAuraloader;
}

export default StandaloneAuraloader;
