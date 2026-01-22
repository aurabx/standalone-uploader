import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  UploaderConfigResponse,
  UploadInitRequest,
  UploadInitResponse,
  UploadLifecycleRequest,
  StudyInfo,
} from '../types';

/**
 * API client for communicating with the Aura standalone endpoints.
 * Handles token-based authentication and all upload lifecycle operations.
 */
export class ApiClient {
  private client: AxiosInstance;
  private apiToken: string;

  constructor(baseUrl: string, apiToken: string) {
    this.apiToken = apiToken;
    this.client = axios.create({
      baseURL: baseUrl.replace(/\/$/, ''), // Remove trailing slash
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Add auth token to all requests
    this.client.interceptors.request.use((config) => {
      config.headers.Authorization = `Bearer ${this.apiToken}`;
      return config;
    });
  }

  /**
   * Get uploader configuration (Tus endpoint, credentials)
   */
  async getConfig(): Promise<UploaderConfigResponse> {
    const response = await this.client.get<UploaderConfigResponse>('/standalone/config');
    return response.data;
  }

  /**
   * Validate application credentials
   */
  async validateAppCredentials(appId: string, appToken: string): Promise<{ valid: boolean }> {
    const response = await this.client.post<{ valid: boolean }>('/standalone/config/validate', {
      app_id: appId,
      app_token: appToken,
    });
    return response.data;
  }

  /**
   * Initialize an upload session
   */
  async uploadInit(data: {
    upload_id: string;
    studies: Record<string, StudyInfo>;
    mode?: string;
    source?: string;
    patient_id?: string;
    app?: {
      id: string;
      token: string;
    };
    context?: Record<string, unknown>;
  }): Promise<UploadInitResponse> {
    const response = await this.client.post<UploadInitResponse>('/standalone/upload/init', {
      upload_id: data.upload_id,
      studies: data.studies,
      mode: 'bulk',
      type: 'standalone',
      source: data.source || 'standalone-uploader',
      patient_id: data.patient_id ?? null,
      app: data.app,
      context: data.context,
    });
    return response.data;
  }

  /**
   * Mark upload as started
   */
  async uploadStart(data: {
    upload_id: string;
    assembly_id?: string;
    mode?: string;
  }): Promise<void> {
    await this.client.post('/standalone/upload/start', {
      upload_id: data.upload_id,
      assembly_id: data.assembly_id,
      mode: data.mode || 'standalone',
    });
  }

  /**
   * Mark upload as complete
   */
  async uploadComplete(data: {
    upload_id: string;
    assembly_id?: string;
    mode?: string;
  }): Promise<void> {
    await this.client.post('/standalone/upload/complete', {
      upload_id: data.upload_id,
      assembly_id: data.assembly_id,
      mode: data.mode || 'standalone',
    });
  }

  /**
   * Report upload error
   */
  async uploadError(data: {
    upload_id: string;
    message: string;
    mode?: string;
  }): Promise<void> {
    await this.client.post('/standalone/upload/error', {
      upload_id: data.upload_id,
      message: data.message,
      mode: data.mode || 'standalone',
    });
  }

  /**
   * Cancel upload
   */
  async uploadCancel(data: {
    upload_id: string;
    mode?: string;
  }): Promise<void> {
    await this.client.post('/standalone/upload/cancel', {
      upload_id: data.upload_id,
      mode: data.mode || 'standalone',
    });
  }

  /**
   * Check if an error is an authentication error
   */
  static isAuthError(error: unknown): boolean {
    if (error instanceof AxiosError) {
      return error.response?.status === 401 || error.response?.status === 403;
    }
    return false;
  }

  /**
   * Extract error message from axios error
   */
  static getErrorMessage(error: unknown): string {
    if (error instanceof AxiosError) {
      // Handle Laravel validation errors
      if (error.response?.data?.errors) {
        const errors = error.response.data.errors;
        const messages = Object.values(errors).flat();
        return messages.join(', ');
      }
      return error.response?.data?.message || error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'An unknown error occurred';
  }
}
