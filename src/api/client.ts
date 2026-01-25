import axios, { AxiosInstance, AxiosError } from "axios";
import type {
  UploaderConfigResponse,
  UploadInitResponse,
  StudyInfo,
} from "../types";

/**
 * API client for communicating with the Aura uploader endpoints.
 * Uses ephemeral upload tokens for authentication (Bearer token).
 */
export class ApiClient {
  private client: AxiosInstance;
  private apiToken: string;
  private uploadToken: string;

  /**
   * Create a new API client.
   *
   * @param baseUrl - Base URL for the Aura API
   * @param apiToken - Service API key for team/realm identification
   * @param uploadToken - Ephemeral upload token obtained from backend
   */
  constructor(baseUrl: string, apiToken: string, uploadToken: string) {
    this.apiToken = apiToken;
    this.uploadToken = uploadToken;
    this.client = axios.create({
      baseURL: baseUrl.replace(/\/$/, ""), // Remove trailing slash
      headers: {
        Accept: "application/json",
      },
    });

    // Add Service API key for team/realm context
    this.client.interceptors.request.use((config) => {
      config.headers["X-Api-Key"] = this.apiToken;
      return config;
    });

    // Add upload token as Bearer token
    this.client.interceptors.request.use((config) => {
      config.headers["Authorization"] = `Bearer ${this.uploadToken}`;
      return config;
    });
  }

  /**
   * Get uploader configuration (Tus endpoint, credentials)
   */
  async getConfig(): Promise<UploaderConfigResponse> {
    const response = await this.client.get<UploaderConfigResponse>(
      "/uploader/config"
    );
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
    context?: Record<string, unknown>;
  }): Promise<UploadInitResponse> {
    const response = await this.client.post<UploadInitResponse>(
      "/uploader/upload/init",
      {
        upload_id: data.upload_id,
        studies: data.studies,
        mode: "bulk",
        type: "uploader",
        source: data.source || "standalone-uploader",
        patient_id: data.patient_id ?? null,
        context: data.context,
      }
    );
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
    await this.client.post("/uploader/upload/start", {
      upload_id: data.upload_id,
      assembly_id: data.assembly_id,
      mode: data.mode || "uploader",
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
    await this.client.post("/uploader/upload/complete", {
      upload_id: data.upload_id,
      assembly_id: data.assembly_id,
      mode: data.mode || "uploader",
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
    await this.client.post("/uploader/upload/error", {
      upload_id: data.upload_id,
      message: data.message,
      mode: data.mode || "uploader",
    });
  }

  /**
   * Cancel upload
   */
  async uploadCancel(data: {
    upload_id: string;
    mode?: string;
  }): Promise<void> {
    await this.client.post("/uploader/upload/cancel", {
      upload_id: data.upload_id,
      mode: data.mode || "uploader",
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
        return messages.join(", ");
      }
      // Handle HMAC authentication errors
      if (error.response?.data?.error?.message) {
        return error.response.data.error.message;
      }
      return error.response?.data?.message || error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return "An unknown error occurred";
  }
}
