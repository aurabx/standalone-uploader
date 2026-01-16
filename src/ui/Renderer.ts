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

  constructor(containerId: string, store: Store) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element with id "${containerId}" not found`);
    }
    this.container = container;
    this.store = store;
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
      }
      .sal-loader {
        width: 48px;
        height: 48px;
        border: 4px solid #e4e4e7;
        border-top-color: #3b82f6;
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
        background-color: #fef2f2;
        color: #dc2626;
        padding: 16px;
        border-radius: 8px;
      }
      .sal-study-card {
        display: grid;
        gap: 16px;
        grid-template-columns: 1fr auto;
        align-items: center;
        border-radius: 8px;
        border: 1px solid #e4e4e7;
        background: white;
        padding: 16px 24px;
        margin-top: 16px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      }
      .sal-study-name {
        font-weight: 600;
        color: #27272a;
        margin-bottom: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sal-study-desc {
        font-weight: 500;
        color: #52525b;
        font-size: 14px;
        margin-bottom: 4px;
      }
      .sal-study-meta {
        font-size: 14px;
        color: #71717a;
        display: flex;
        gap: 8px;
      }
      .sal-study-meta span:not(:last-child)::after {
        content: '|';
        margin-left: 8px;
        color: #d4d4d8;
      }
      .sal-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 16px;
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
        background: #3b82f6;
        color: white;
      }
      .sal-btn-primary:hover:not(:disabled) {
        background: #2563eb;
      }
      .sal-btn-secondary {
        background: #f4f4f5;
        color: #27272a;
        border: 1px solid #e4e4e7;
      }
      .sal-btn-secondary:hover:not(:disabled) {
        background: #e4e4e7;
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
        min-height: 200px;
        border: 2px dashed #d4d4d8;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .sal-drag-drop-area-pending {
        min-height: 100px;
      }
      .sal-progress-area {
        margin-top: 16px;
      }
      .sal-title {
        font-size: 18px;
        font-weight: 600;
        color: #27272a;
        margin-bottom: 16px;
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
      .sal-images-count {
        font-size: 14px;
        color: #71717a;
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

  private renderStep(state: UploaderState): string {
    switch (state.step) {
      case 'start':
        return this.renderStartStep();
      case 'processing':
        return this.renderProcessingStep();
      case 'pending':
        return this.renderPendingStep(state);
      case 'uploading':
        return this.renderUploadingStep(state);
      case 'complete':
        return this.renderCompleteStep(state);
      case 'error':
        return this.renderErrorStep(state);
      case 'cancelled':
        return this.renderCancelledStep();
      default:
        return this.renderStartStep();
    }
  }

  private renderStartStep(): string {
    return `
      <div id="sal-drag-drop-area" class="sal-drag-drop-area"></div>
    `;
  }

  private renderProcessingStep(): string {
    return `
      <div class="sal-center">
        <div class="sal-loader"></div>
        <div class="sal-center-message">Processing files...</div>
      </div>
    `;
  }

  private renderPendingStep(state: UploaderState): string {
    if (state.totalFiles < 1) {
      return `
        <div class="sal-center">
          <p style="font-size: 24px; margin-bottom: 16px;">No valid DICOM images found</p>
          <p style="color: #71717a;">Please ensure you're uploading valid DICOM files.</p>
        </div>
      `;
    }

    return `
      <div class="sal-title">Ready to upload</div>
      <div id="sal-studies-list">
        ${state.studies.map((study) => this.renderStudyCard(study)).join('')}
      </div>
      <div id="sal-drag-drop-area" class="sal-drag-drop-area sal-drag-drop-area-pending" style="margin-top: 16px;"></div>
    `;
  }

  private renderStudyCard(study: StudyInfo): string {
    const name = formatName(study.patient_name) || 'Unknown Patient';
    const date = formatDate(study.study_date);
    const modalities = study.modalities?.join(', ') || '';

    return `
      <div class="sal-study-card" data-study-uid="${study.study_uid}">
        <div>
          <div class="sal-study-name">${this.escapeHtml(name)}</div>
          <div class="sal-study-desc">
            ${this.escapeHtml(study.study_description || 'No description')}
            ${modalities ? `(${this.escapeHtml(modalities)})` : ''}
          </div>
          <div class="sal-study-meta">
            <span>${date || 'No date'}</span>
            <span>${this.escapeHtml(study.institution_name || 'Unknown institution')}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span class="sal-images-count">${study.images} image${study.images !== 1 ? 's' : ''} over ${study.series_count} series</span>
          <button class="sal-btn sal-btn-secondary sal-remove-study" data-study-uid="${study.study_uid}">
            Skip
          </button>
        </div>
      </div>
    `;
  }

  private renderUploadingStep(state: UploaderState): string {
    const title = state.complete
      ? `Successfully uploaded ${state.totalFiles} image${state.totalFiles !== 1 ? 's' : ''}`
      : `Uploading ${state.totalFiles} image${state.totalFiles !== 1 ? 's' : ''}...`;

    if (state.zipping) {
      return `
        <div class="sal-title">${title}</div>
        <div class="sal-center">
          <div class="sal-loader"></div>
          <div class="sal-center-message">Preparing files for upload...</div>
        </div>
      `;
    }

    return `
      <div class="sal-title">${title}</div>
      <div id="sal-progress-area" class="sal-progress-area"></div>
    `;
  }

  private renderCompleteStep(state: UploaderState): string {
    return `
      <div class="sal-center">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9 12l2 2 4-4"/>
        </svg>
        <div class="sal-center-message" style="font-size: 24px; color: #22c55e;">
          Upload complete!
        </div>
        <p style="color: #71717a; margin-top: 8px;">
          ${state.totalFiles} image${state.totalFiles !== 1 ? 's' : ''} uploaded successfully.
        </p>
      </div>
    `;
  }

  private renderErrorStep(state: UploaderState): string {
    return `
      <div class="sal-error">
        <p style="font-size: 18px; font-weight: 500; margin-bottom: 8px;">Upload Error</p>
        <p>${this.escapeHtml(state.errorMessage || 'An unknown error occurred.')}</p>
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

    // Complete button
    if (state.step === 'uploading' && state.complete) {
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
