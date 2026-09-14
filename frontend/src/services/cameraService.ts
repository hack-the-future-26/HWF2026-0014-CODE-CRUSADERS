import { Camera, CameraResultType, CameraSource, PermissionStatus } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { compressDocumentBase64 } from './imageCompressor';

export interface CapturedDocument {
  dataUrl: string;
  format: string;
  source: 'camera' | 'gallery' | 'file';
}

export class CameraError extends Error {
  constructor(message: string, public code: 'PERMISSION_DENIED' | 'UNAVAILABLE' | 'CANCELLED' | 'INVALID_IMAGE' | 'UNKNOWN') {
    super(message);
    this.name = 'CameraError';
  }
}

export const cameraService = {
  /**
   * Check or request camera permissions.
   */
  async checkPermissions(): Promise<PermissionStatus> {
    if (!Capacitor.isPluginAvailable('Camera')) {
      return { camera: 'granted', photos: 'granted' };
    }
    try {
      return await Camera.checkPermissions();
    } catch (err) {
      console.warn('Camera.checkPermissions failed:', err);
      return { camera: 'prompt', photos: 'prompt' };
    }
  },

  async requestPermissions(): Promise<PermissionStatus> {
    if (!Capacitor.isPluginAvailable('Camera')) {
      return { camera: 'granted', photos: 'granted' };
    }
    try {
      return await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
    } catch (err) {
      console.warn('Camera.requestPermissions failed:', err);
      return { camera: 'denied', photos: 'denied' };
    }
  },

  /**
   * Capture a document photo using device camera
   */
  async captureDocument(): Promise<CapturedDocument | null> {
    try {
      // If running on native platform, verify permissions
      if (Capacitor.isNativePlatform()) {
        const status = await this.checkPermissions();
        if (status.camera === 'denied') {
          const req = await this.requestPermissions();
          if (req.camera === 'denied') {
            throw new CameraError('Camera access was denied. Please grant camera permissions in Android device settings.', 'PERMISSION_DENIED');
          }
        }
      }

      const image = await Camera.getPhoto({
        quality: 90,
        width: 1920,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        correctOrientation: true,
        saveToGallery: false,
        promptLabelHeader: 'Scan Document',
        promptLabelPhoto: 'From Gallery',
        promptLabelPicture: 'Take Photo'
      });

      if (!image || !image.dataUrl) {
        throw new CameraError('No image data was returned from camera.', 'INVALID_IMAGE');
      }

      // Automatically compress and resize if necessary
      const compressedDataUrl = await compressDocumentBase64(image.dataUrl);

      return {
        dataUrl: compressedDataUrl,
        format: image.format || 'jpeg',
        source: 'camera'
      };
    } catch (err: any) {
      // User cancelled
      if (err.message && (err.message.includes('User cancelled') || err.message.includes('cancelled') || err.message.includes('closed'))) {
        return null;
      }
      if (err instanceof CameraError) {
        throw err;
      }
      if (err.message && err.message.includes('Permission')) {
        throw new CameraError('Camera permission was denied. Please allow camera access to scan documents.', 'PERMISSION_DENIED');
      }
      console.error('Camera capture error:', err);
      throw new CameraError(err.message || 'Failed to capture document image with camera.', 'UNKNOWN');
    }
  },

  /**
   * Select a document image from gallery or file storage
   */
  async selectFromGallery(): Promise<CapturedDocument | null> {
    try {
      if (Capacitor.isPluginAvailable('Camera')) {
        const image = await Camera.getPhoto({
          quality: 90,
          width: 1920,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Photos,
          correctOrientation: true
        });

        if (!image || !image.dataUrl) {
          return null;
        }

        // Automatically compress and resize if necessary
        const compressedDataUrl = await compressDocumentBase64(image.dataUrl);

        return {
          dataUrl: compressedDataUrl,
          format: image.format || 'jpeg',
          source: 'gallery'
        };
      } else {
        // Fallback for browser environment: trigger hidden file picker
        return await this.pickFileViaBrowser();
      }
    } catch (err: any) {
      if (err.message && (err.message.includes('User cancelled') || err.message.includes('cancelled') || err.message.includes('closed'))) {
        return null;
      }
      console.error('Gallery selection error:', err);
      // Fallback to browser file picker if plugin failed
      return await this.pickFileViaBrowser();
    }
  },

  /**
   * Browser file picker fallback
   */
  pickFileViaBrowser(): Promise<CapturedDocument | null> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp,image/jpg';

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }

        if (!file.type.startsWith('image/')) {
          reject(new CameraError('Selected file is not an image. Please choose a PNG, JPG, or WEBP document.', 'INVALID_IMAGE'));
          return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
          if (e.target?.result) {
            try {
              const compressedDataUrl = await compressDocumentBase64(e.target.result as string);
              resolve({
                dataUrl: compressedDataUrl,
                format: file.type.split('/')[1] || 'jpeg',
                source: 'file'
              });
            } catch (compErr: any) {
              reject(compErr);
            }
          } else {
            resolve(null);
          }
        };
        reader.onerror = () => {
          reject(new CameraError('Failed to read selected image file.', 'UNKNOWN'));
        };
        reader.readAsDataURL(file);
      };

      input.oncancel = () => {
        resolve(null);
      };

      input.click();
    });
  }
};
