import { Capacitor } from '@capacitor/core';
import { AnalyzeResponse, HealthStatus, HistoryItem, SampleDocument } from '../types';
import { compressDocumentBase64, compressDocumentFile, sanitizeUploadErrorMessage } from './imageCompressor';

// Hardcoded target for mobile network testing per instructions
const MOBILE_TARGET_URL = 'http://10.90.130.149:8000/api';

export const getApiBaseUrl = (): string => {
  // If running inside Capacitor (native Android app)
  if (Capacitor.isNativePlatform()) {
    return MOBILE_TARGET_URL;
  }

  // Check build-time environment variable (e.g. from .env)
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL || (import.meta as any).env?.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    let cleaned = envUrl.trim().replace(/\/+$/, '');
    if (!cleaned.endsWith('/api')) {
      cleaned += '/api';
    }
    return cleaned;
  }

  // In browser, default to /api which Vite proxies to backend
  return '/api';
};

export const setApiBaseUrl = (url: string): void => {
  try {
    if (!url || !url.trim()) {
      localStorage.removeItem('idshield_api_base');
    } else {
      localStorage.setItem('idshield_api_base', url.trim().replace(/\/+$/, ''));
    }
  } catch (err) {
    console.warn('[IDShield API] Failed to persist API base URL:', err);
  }
};

const handleFetchError = (endpoint: string, err: any): never => {
  const fullUrl = `${getApiBaseUrl()}${endpoint}`;
  console.error(`[IDShield API] Request failed for ${fullUrl}:`, err);

  if (err?.message) {
    const sanitized = sanitizeUploadErrorMessage(err.message);
    if (sanitized !== err.message) {
      throw new Error(sanitized);
    }
  }

  if (err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('NetworkError') || err.message.includes('Failed to fetch'))) {
    throw new Error(`Analysis service unavailable (${fullUrl}). Check network connection and verify backend is running on http://10.90.130.149:8000.`);
  }
  throw err;
};

export interface DocumentQualityMetrics {
  blur_score: number;
  is_blurry: boolean;
  brightness: number;
  is_too_dark: boolean;
  is_too_bright: boolean;
  glare_percentage: number;
  glare_detected: boolean;
  coverage_percentage: number;
  is_too_far: boolean;
  is_too_close: boolean;
  is_partially_out: boolean;
  aspect_ratio: number;
  quality_status: string;
  quality_message: string;
}

export const api = {
  getBaseUrl(): string {
    return getApiBaseUrl();
  },

  setBaseUrl(url: string): void {
    setApiBaseUrl(url);
  },

  async getHealth(): Promise<HealthStatus> {
    const url = `${getApiBaseUrl()}/health`;
    console.log(`[IDShield API] GET ${url}`);
    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      console.log(`[IDShield API] GET ${url} -> Status: ${res.status}`);
      if (!res.ok) {
        throw new Error(`Health check failed: ${res.status} ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      return handleFetchError('/health', err);
    }
  },

  async getSamples(): Promise<SampleDocument[]> {
    const url = `${getApiBaseUrl()}/samples`;
    console.log(`[IDShield API] GET ${url}`);
    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      console.log(`[IDShield API] GET ${url} -> Status: ${res.status}`);
      if (!res.ok) {
        throw new Error(`Failed to load synthetic samples: ${res.status} ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      return handleFetchError('/samples', err);
    }
  },

  async getHistory(): Promise<HistoryItem[]> {
    const url = `${getApiBaseUrl()}/history`;
    console.log(`[IDShield API] GET ${url}`);
    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      console.log(`[IDShield API] GET ${url} -> Status: ${res.status}`);
      if (!res.ok) {
        throw new Error(`Failed to load history: ${res.status} ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      return handleFetchError('/history', err);
    }
  },

  async clearHistory(): Promise<{ message: string }> {
    const url = `${getApiBaseUrl()}/history`;
    console.log(`[IDShield API] DELETE ${url}`);
    try {
      const res = await fetch(url, { method: 'DELETE' });
      console.log(`[IDShield API] DELETE ${url} -> Status: ${res.status}`);
      if (!res.ok) {
        throw new Error(`Failed to clear history: ${res.status} ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      return handleFetchError('/history', err);
    }
  },

  async analyzeSample(sampleId: string): Promise<AnalyzeResponse> {
    const url = `${getApiBaseUrl()}/analyze`;
    console.log(`[IDShield API] POST ${url} (sampleId: ${sampleId})`);
    try {
      const formData = new FormData();
      formData.append('sample_id', sampleId);

      const res = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      console.log(`[IDShield API] POST ${url} -> Status: ${res.status}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `Analysis request failed with status ${res.status}`);
      }

      const data: AnalyzeResponse = await res.json();
      console.log(`[STAGE 4: Frontend Received Fields] Received for demo specimen (${sampleId}):`, data.extracted_fields?.map(f => `${f.field_name}: "${f.value}"`));
      return data;
    } catch (err) {
      return handleFetchError('/analyze', err);
    }
  },

  async analyzeFile(file: File): Promise<AnalyzeResponse> {
    const preparedFile = await compressDocumentFile(file);
    const url = `${getApiBaseUrl()}/analyze`;
    console.log(`[IDShield API] POST ${url} (filename: ${preparedFile.name}, size: ${preparedFile.size} bytes)`);
    try {
      const formData = new FormData();
      formData.append('file', preparedFile);

      const res = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      console.log(`[IDShield API] POST ${url} -> Status: ${res.status}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        const rawDetail = err.detail || `Analysis request failed with status ${res.status}`;
        throw new Error(sanitizeUploadErrorMessage(rawDetail));
      }

      const data: AnalyzeResponse = await res.json();
      console.log(`[STAGE 4: Frontend Received Fields] Received for uploaded file (${preparedFile.name}):`, data.extracted_fields?.map(f => `${f.field_name}: "${f.value}"`));
      return data;
    } catch (err) {
      return handleFetchError('/analyze', err);
    }
  },

  async analyzeBase64(base64Data: string): Promise<AnalyzeResponse> {
    const preparedBase64 = await compressDocumentBase64(base64Data);
    const url = `${getApiBaseUrl()}/analyze`;
    console.log(`[IDShield API] POST ${url} (base64 image payload length: ${preparedBase64.length} chars)`);
    try {
      const formData = new FormData();
      formData.append('image_base64', preparedBase64);

      const res = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      console.log(`[IDShield API] POST ${url} -> Status: ${res.status}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        const rawDetail = err.detail || `Analysis request failed with status ${res.status}`;
        throw new Error(sanitizeUploadErrorMessage(rawDetail));
      }

      const data: AnalyzeResponse = await res.json();
      console.log(`[STAGE 4: Frontend Received Fields] Received for camera/gallery image:`, data.extracted_fields?.map(f => `${f.field_name}: "${f.value}"`));
      return data;
    } catch (err) {
      return handleFetchError('/analyze', err);
    }
  },

  async detectDocumentCorners(base64Data: string): Promise<{
    detected: boolean;
    confidence: number;
    corners: [number, number][];
    image_width: number;
    image_height: number;
    quality?: DocumentQualityMetrics;
  }> {
    const url = `${getApiBaseUrl()}/scan/detect-document`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64Data }),
      });
      if (!res.ok) {
        throw new Error(`Detect failed with status ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.warn('[IDShield API] detectDocumentCorners fallback:', err);
      return {
        detected: false,
        confidence: 0,
        corners: [[0, 0], [100, 0], [100, 100], [0, 100]],
        image_width: 100,
        image_height: 100,
      };
    }
  },

  async warpDocumentPerspective(base64Data: string, corners: [number, number][]): Promise<{
    warped_image_base64: string;
    width: number;
    height: number;
  }> {
    const url = `${getApiBaseUrl()}/scan/warp-document`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64Data, corners }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(errJson.detail || `Warp request failed with status ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      return handleFetchError('/scan/warp-document', err);
    }
  }
};

