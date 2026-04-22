import type { UploaderState, StudyInfo } from '../types';
import { Store } from './Store';
import { formatName, formatDate, formatModalities } from '../core/dicom';

/**
 * UI Renderer for the standalone uploader.
 * Generates and updates the UI based on state changes.
 */
export class Renderer {
  private container: HTMLElement;
  private store: Store;
  private unsubscribe: (() => void) | null = null;
  private onRenderCallback: ((state: UploaderState) => void) | null = null;

  constructor(containerId: string, store: Store) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element with id "${containerId}" not found`);
    }
    this.container = container;
    this.store = store;
  }

  /**
   * Set a callback to be invoked after each render
   */
  onRender(callback: (state: UploaderState) => void): void {
    this.onRenderCallback = callback;
  }

  /**
   * Mount the UI and start listening to state changes
   */
  mount(): void {
    this.injectStyles();
    this.render(this.store.getState());
    this.unsubscribe = this.store.subscribe((state) => this.render(state));
  }

  /**
   * Unmount the UI
   */
  unmount(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.container.innerHTML = '';
  }

  /**
   * Inject required CSS styles
   */
  private injectStyles(): void {
    if (document.getElementById('standalone-auraloader-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'standalone-auraloader-styles';
    style.textContent = `
      .sal-container {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #52525b;
        max-width: 100%;
        padding: 24px;
      }
      .sal-header {
        margin-bottom: 16px;
      }
      .sal-title {
        font-size: 24px;
        font-weight: 700;
        color: #1a1a1a;
        margin: 0 0 8px 0;
      }
      .sal-description {
        font-size: 14px;
        color: #6b7280;
        line-height: 1.5;
        margin: 0;
      }
      .sal-status-message {
        font-size: 14px;
        font-weight: 500;
        color: #047857;
        margin: 16px 0;
      }
      .sal-success {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        background-color: #ecfdf5;
        border: 1px solid #a7f3d0;
        color: #065f46;
        padding: 16px;
        border-radius: 8px;
        margin: 16px 0;
      }
      .sal-success-icon {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        color: #059669;
        margin-top: 1px;
      }
      .sal-success-body {
        flex: 1;
        min-width: 0;
      }
      .sal-success-title {
        font-size: 14px;
        font-weight: 600;
        color: #065f46;
        margin: 0 0 2px 0;
      }
      .sal-success-subtitle {
        font-size: 13px;
        color: #047857;
        margin: 0;
      }
      .sal-link {
        display: inline-block;
        background: none;
        border: none;
        padding: 0;
        color: #6366f1;
        font-size: 14px;
        font-weight: 500;
        text-decoration: none;
        cursor: pointer;
        font-family: inherit;
      }
      .sal-link:hover {
        text-decoration: underline;
        color: #4f46e5;
      }
      .sal-loader {
        width: 48px;
        height: 48px;
        border: 4px solid #e4e4e7;
        border-top-color: #6366f1;
        border-radius: 50%;
        animation: sal-spin 1s linear infinite;
      }
      @keyframes sal-spin {
        to { transform: rotate(360deg); }
      }
      .sal-warning {
        background-color: #fef3c7;
        border: 1px solid #fcd34d;
        color: #92400e;
        padding: 12px 16px;
        border-radius: 8px;
        margin-bottom: 16px;
      }
      .sal-error {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        background-color: #fef2f2;
        color: #991b1b;
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 16px;
        border: 1px solid #fecaca;
      }
      .sal-error-icon {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        color: #dc2626;
        margin-top: 1px;
      }
      .sal-error-body {
        flex: 1;
        min-width: 0;
      }
      .sal-error-title {
        font-size: 14px;
        font-weight: 600;
        margin: 0 0 4px 0;
        color: #991b1b;
      }
      .sal-error-message {
        font-size: 13px;
        margin: 0 0 4px 0;
        line-height: 1.5;
        color: #7f1d1d;
      }
      .sal-error-instructions {
        font-size: 13px;
        margin: 0;
        color: #991b1b;
        opacity: 0.85;
      }
      .sal-study-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
        background: white;
        padding: 16px 20px;
        margin-bottom: 12px;
        box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      .sal-study-card:hover {
        border-color: #d1d5db;
        box-shadow: 0 1px 3px rgba(16, 24, 40, 0.08);
      }
      .sal-study-info {
        flex: 1;
      }
      .sal-study-name {
        font-weight: 600;
        font-size: 15px;
        color: #1a1a1a;
        margin-bottom: 2px;
      }
      .sal-study-desc {
        font-size: 14px;
        color: #4b5563;
        margin-bottom: 2px;
      }
      .sal-study-meta {
        font-size: 13px;
        color: #9ca3af;
      }
      .sal-study-meta span:not(:last-child)::after {
        content: '|';
        margin: 0 8px;
        color: #d1d5db;
      }
      .sal-study-actions {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-left: 16px;
      }
      .sal-images-count {
        font-size: 13px;
        color: #6b7280;
        white-space: nowrap;
      }
      .sal-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 20px;
        border-radius: 6px;
        font-weight: 500;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.15s;
        border: none;
      }
      .sal-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .sal-btn-primary {
        background: #6366f1;
        color: white;
        box-shadow: 0 1px 2px rgba(99, 102, 241, 0.2);
      }
      .sal-btn-primary:hover:not(:disabled) {
        background: #4f46e5;
        box-shadow: 0 2px 4px rgba(79, 70, 229, 0.25);
      }
      .sal-btn-primary:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.35);
      }
      .sal-btn-secondary {
        background: #f3f4f6;
        color: #374151;
        border: 1px solid #e5e7eb;
      }
      .sal-btn-secondary:hover:not(:disabled) {
        background: #e5e7eb;
      }
      .sal-btn-skip {
        background: white;
        color: #374151;
        border: 1px solid #d1d5db;
        padding: 8px 16px;
        font-size: 13px;
      }
      .sal-btn-skip:hover:not(:disabled) {
        background: #f9fafb;
      }
      .sal-buttons {
        display: flex;
        justify-content: space-between;
        margin-top: 24px;
        gap: 8px;
      }
      .sal-buttons-left, .sal-buttons-right {
        display: flex;
        gap: 8px;
      }
      .sal-drag-drop-area {
        min-height: 180px;
      }
      .sal-drag-drop-text {
        font-size: 14px;
        color: #6b7280;
      }
      .sal-drag-drop-text a {
        color: #6366f1;
        text-decoration: none;
        font-weight: 500;
      }
      .sal-drag-drop-text a:hover {
        text-decoration: underline;
      }
      .sal-progress-container {
        margin: 16px 0;
      }
      .sal-progress-bar {
        height: 8px;
        background: #e5e7eb;
        border-radius: 4px;
        overflow: hidden;
      }
      .sal-progress-fill {
        height: 100%;
        background: #6366f1;
        border-radius: 4px;
        transition: width 0.3s ease-out;
      }
      .sal-progress-fill.sal-complete {
        background: #6366f1;
      }
      .sal-progress-status {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
        font-size: 13px;
        color: #6b7280;
      }
      .sal-progress-status svg {
        color: #6366f1;
      }
      .sal-center {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px;
        text-align: center;
      }
      .sal-center-message {
        margin-top: 16px;
        font-weight: 500;
      }
      .sal-hidden { display: none !important; }
      .sal-complete-section {
        padding: 24px;
      }
      .sal-complete-title {
        font-size: 24px;
        font-weight: 700;
        color: #1a1a1a;
        margin-bottom: 8px;
      }
      .sal-complete-message {
        font-size: 14px;
        color: #6b7280;
        line-height: 1.5;
      }
      .sal-close-message {
        font-size: 14px;
        color: #6b7280;
        margin-top: 16px;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Render the UI based on current state
   */
  private render(state: UploaderState): void {
    this.container.innerHTML = `
      <div class="sal-container">
        ${this.renderConnectionWarning(state)}
        ${this.renderStep(state)}
        ${this.renderButtons(state)}
      </div>
    `;
    this.attachEventListeners(state);
    
    // Call the render callback to allow plugins to be mounted
    if (this.onRenderCallback) {
      this.onRenderCallback(state);
    }
  }

  private renderConnectionWarning(state: UploaderState): string {
    if (!state.connectionIssues) return '';
    return `
      <div class="sal-warning">
        Connection issues detected. Uploads may be slow or fail.
        <a href="https://help.aurabox.cloud/troubleshooting" target="_blank" style="text-decoration: underline;">
          Learn more
        </a>
      </div>
    `;
  }

  private renderErrorMessage(state: UploaderState): string {
    if (state.step !== 'error' || !state.errorMessage) return '';
    return `
      <div class="sal-error" role="alert">
        <svg class="sal-error-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        <div class="sal-error-body">
          <p class="sal-error-title">Upload error</p>
          <p class="sal-error-message">${this.escapeHtml(state.errorMessage)}</p>
          <p class="sal-error-instructions">Reload the page and try again. Please contact us if this error persists.</p>
        </div>
      </div>
    `;
  }

  private renderStep(state: UploaderState): string {
    switch (state.step) {
      case 'start':
        return this.renderStartStep(state);
      case 'processing':
        return this.renderProcessingStep();
      case 'pending':
        return this.renderPendingStep(state);
      case 'uploading':
        return this.renderUploadingStep(state);
      case 'complete':
        return this.renderCompleteStep(state);
      case 'error':
        // Show the start step UI when there's an error, with error message after header
        return this.renderStartStep(state);
      case 'cancelled':
        return this.renderCancelledStep();
      default:
        return this.renderStartStep(state);
    }
  }

  private renderHeader(): string {
    return `
      <div class="sal-header">
        <h2 class="sal-title">Upload</h2>
        <p class="sal-description">Drag-and-drop your files. The uploader will filter out invalid files, and prepare your imaging for upload. Note: You do not need to select the imaging files from the folder.</p>
      </div>
    `;
  }

  private renderStartStep(state?: UploaderState): string {
    const isError = state?.step === 'error';
    return `
      ${this.renderHeader()}
      ${state ? this.renderErrorMessage(state) : ''}
      <div id="sal-drag-drop-area" class="sal-drag-drop-area ${isError ? 'sal-hidden' : ''}"></div>
    `;
  }

  private renderProcessingStep(): string {
    return `
      ${this.renderHeader()}
      <div class="sal-center">
        <div class="sal-loader"></div>
        <div class="sal-center-message">Processing files...</div>
      </div>
    `;
  }

  private renderPendingStep(state: UploaderState): string {
    if (state.totalFiles < 1) {
      return `
        ${this.renderHeader()}
        <div class="sal-center">
          <p style="font-size: 18px; margin-bottom: 16px; color: #1a1a1a;">No valid DICOM images found</p>
          <p style="color: #6b7280; font-size: 14px;">Please ensure you're uploading valid DICOM files.</p>
        </div>
      `;
    }

    return `
      ${this.renderHeader()}
      <p class="sal-status-message">The following studies were found</p>
      <div id="sal-studies-list">
        ${state.studies.map((study) => this.renderStudyCard(study)).join('')}
      </div>
      <div id="sal-drag-drop-area" class="sal-drag-drop-area" style="margin-top: 16px;"></div>
    `;
  }

  private renderStudyCard(study: StudyInfo): string {
    const name = formatName(study.patient_name) || 'Unknown Patient';
    const date = formatDate(study.study_date);
    const modalities = study.modalities?.join(', ') || '';

    return `
      <div class="sal-study-card" data-study-uid="${study.study_uid}">
        <div class="sal-study-info">
          <div class="sal-study-name">${this.escapeHtml(name)}</div>
          <div class="sal-study-desc">
            ${this.escapeHtml(study.study_description || 'No description')}
            ${modalities ? `(${this.escapeHtml(modalities)})` : ''}
          </div>
          <div class="sal-study-meta">
            <span>${date || 'No date'}</span>
            <span>${this.escapeHtml(study.institution_name || 'Unknown institution')}</span>
          </div>
          <div class="sal-study-meta">
            <span class="sal-study-uid">ID: ${this.escapeHtml(study.study_uid)}</span>
          </div>
        </div>
        <div class="sal-study-actions">
          <span class="sal-images-count">${study.images} image${study.images !== 1 ? 's' : ''} over ${study.series_count} series</span>
          <button class="sal-btn sal-btn-skip sal-remove-study" data-study-uid="${study.study_uid}">
            Skip these
          </button>
        </div>
      </div>
    `;
  }

  private renderUploadingStep(state: UploaderState): string {
    const statusMessage = state.complete
      ? `Successfully uploaded ${state.totalFiles} image${state.totalFiles !== 1 ? 's' : ''} to Aurabox`
      : `Uploading ${state.totalFiles} image${state.totalFiles !== 1 ? 's' : ''} to Aurabox...`;

    if (state.zipping) {
      return `
        ${this.renderHeader()}
        <p class="sal-status-message">${statusMessage}</p>
        <div class="sal-center">
          <div class="sal-loader"></div>
          <div class="sal-center-message">Preparing files for upload...</div>
        </div>
      `;
    }

    if (state.complete) {
      const successText = `Successfully uploaded ${state.totalFiles} image${state.totalFiles !== 1 ? 's' : ''} to Aurabox`;
      return `
        ${this.renderHeader()}
        <div class="sal-success" role="status">
          <svg class="sal-success-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
          <div class="sal-success-body">
            <p class="sal-success-title">${this.escapeHtml(successText)}</p>
            <p class="sal-success-subtitle">You may now close the uploader.</p>
          </div>
        </div>
        <button class="sal-link" id="sal-add-more-btn" type="button">Add more</button>
      `;
    }

    return `
      ${this.renderHeader()}
      <p class="sal-status-message">${statusMessage}</p>
      <div id="sal-progress-area" class="sal-progress-area"></div>
    `;
  }

  private renderCompleteStep(state: UploaderState): string {
    return `
      <div class="sal-complete-section">
        <h2 class="sal-complete-title">Complete</h2>
        <p class="sal-complete-message">Upload successful. Scans take a few minutes to be processed and can be viewed in the imaging tab.</p>
        <button class="sal-btn sal-btn-primary sal-add-more">Add more…</button>
      </div>
    `;
  }



  private renderCancelledStep(): string {
    return `
      <div class="sal-center">
        <p style="font-size: 24px;">Upload cancelled</p>
      </div>
    `;
  }

  private renderButtons(state: UploaderState): string {
    const leftButtons: string[] = [];
    const rightButtons: string[] = [];

    // Cancel buttons
    if (state.step === 'start' || state.step === 'pending') {
      leftButtons.push(`<button class="sal-btn sal-btn-secondary" id="sal-cancel-btn">Cancel</button>`);
    }

    if (state.step === 'uploading' && !state.zipping && !state.complete) {
      leftButtons.push(`<button class="sal-btn sal-btn-secondary" id="sal-cancel-upload-btn">Cancel Upload</button>`);
    }

    // Try again buttons
    if (state.step === 'pending' && state.totalFiles < 1) {
      rightButtons.push(`<button class="sal-btn sal-btn-primary" id="sal-reset-btn">Try Again</button>`);
    }

    if (state.step === 'error' || state.step === 'cancelled') {
      rightButtons.push(`<button class="sal-btn sal-btn-primary" id="sal-reset-btn">Try Again</button>`);
    }

    // Upload button
    if (state.step === 'pending' && state.totalFiles > 0) {
      rightButtons.push(`<button class="sal-btn sal-btn-primary" id="sal-upload-btn">Upload</button>`);
    }

    // Show close message when upload is complete
    if (state.step === 'uploading' && state.complete) {
      // No button needed - message shown in the uploading step render
    }

    // Done button (on complete step)
    if (state.step === 'complete') {
      rightButtons.push(`<button class="sal-btn sal-btn-primary" id="sal-done-btn">Done</button>`);
    }

    if (leftButtons.length === 0 && rightButtons.length === 0) {
      return '';
    }

    return `
      <div class="sal-buttons">
        <div class="sal-buttons-left">${leftButtons.join('')}</div>
        <div class="sal-buttons-right">${rightButtons.join('')}</div>
      </div>
    `;
  }

  private attachEventListeners(state: UploaderState): void {
    // Remove study buttons
    this.container.querySelectorAll('.sal-remove-study').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const uid = (e.currentTarget as HTMLElement).dataset.studyUid;
        if (uid) {
          this.container.dispatchEvent(new CustomEvent('sal:removeStudy', { detail: { uid } }));
        }
      });
    });

    // Upload button
    const uploadBtn = this.container.querySelector('#sal-upload-btn');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        this.container.dispatchEvent(new CustomEvent('sal:upload'));
      });
    }

    // Cancel buttons
    const cancelBtn = this.container.querySelector('#sal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.container.dispatchEvent(new CustomEvent('sal:cancel'));
      });
    }

    const cancelUploadBtn = this.container.querySelector('#sal-cancel-upload-btn');
    if (cancelUploadBtn) {
      cancelUploadBtn.addEventListener('click', () => {
        this.container.dispatchEvent(new CustomEvent('sal:cancelUpload'));
      });
    }

    // Reset button
    const resetBtn = this.container.querySelector('#sal-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.container.dispatchEvent(new CustomEvent('sal:reset'));
      });
    }

    // Done button
    const doneBtn = this.container.querySelector('#sal-done-btn');
    if (doneBtn) {
      doneBtn.addEventListener('click', () => {
        this.container.dispatchEvent(new CustomEvent('sal:done'));
      });
    }

    // Add more button
    const addMoreBtn = this.container.querySelector('.sal-add-more');
    if (addMoreBtn) {
      addMoreBtn.addEventListener('click', () => {
        this.container.dispatchEvent(new CustomEvent('sal:reset'));
      });
    }

    // Add more button (on uploading complete)
    const addMoreUploadingBtn = this.container.querySelector('#sal-add-more-btn');
    if (addMoreUploadingBtn) {
      addMoreUploadingBtn.addEventListener('click', () => {
        this.container.dispatchEvent(new CustomEvent('sal:reset'));
      });
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get the drag-drop target selector
   */
  getDragDropTarget(): string {
    return '#sal-drag-drop-area';
  }

  /**
   * Get the progress bar target selector
   */
  getProgressTarget(): string {
    return '#sal-progress-area';
  }
}
