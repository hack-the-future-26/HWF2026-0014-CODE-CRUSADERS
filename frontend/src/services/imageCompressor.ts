/**
 * IDShield AI - Automatic Document Image Compressor
 * 
 * Automatically resizes and compresses document images to safely stay under the 1024 KB backend limit,
 * targeting approximately 700–900 KB maximum while preserving high optical quality for OCR
 * and computer vision analysis.
 */

export const MAX_SAFE_UPLOAD_BYTES = 900 * 1024; // ~900 KB (comfortably below 1024 KB)
export const TARGET_MAX_BYTES = 880 * 1024;      // ~880 KB upper target ceiling
export const MAX_DOCUMENT_DIMENSION = 1920;      // 1920px max dimension provides 2+ MP, optimal for OCR

export const USER_FRIENDLY_TOO_LARGE_ERROR =
  'Image too large. Please capture the document again or choose another image.';

/**
 * Loads an image from a data URL or object URL into an HTMLImageElement
 */
function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for compression.'));
    img.src = src;
  });
}

/**
 * Calculates optimal target dimensions maintaining aspect ratio
 */
function getScaledDimensions(
  width: number,
  height: number,
  maxDimension: number = MAX_DOCUMENT_DIMENSION
): { width: number; height: number } {
  const maxCurrent = Math.max(width, height);
  if (maxCurrent <= maxDimension) {
    return { width, height };
  }
  const ratio = maxDimension / maxCurrent;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

/**
 * Draws an HTMLImageElement to an HTMLCanvasElement with white background and high-quality smoothing
 */
function drawToCanvas(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for image processing.');
  }

  // White background in case the input has transparent/alpha pixels (e.g. PNG)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // High quality interpolation for OCR edge fidelity
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  return canvas;
}

/**
 * Automatically compresses a base64 Data URL (from Camera or Gallery)
 * 
 * - If already below limit and within reasonable dimensions, preserves original quality.
 * - Otherwise, resizes and re-encodes as JPEG targeting 700–900 KB.
 * - If still unable to fit, throws USER_FRIENDLY_TOO_LARGE_ERROR.
 */
export async function compressDocumentBase64(base64Data: string): Promise<string> {
  if (!base64Data || typeof base64Data !== 'string') {
    return base64Data;
  }

  // Check current payload size in bytes
  // For ASCII data URLs, string length is the byte size in multipart form-data
  const currentByteSize = base64Data.length;

  // If already comfortably below limit and is JPEG format, check dimensions
  if (currentByteSize <= TARGET_MAX_BYTES && base64Data.startsWith('data:image/jpeg')) {
    // Already small JPEG below safe limit; preserve quality
    return base64Data;
  }

  const img = await loadImageElement(base64Data);

  // If already below target size and dimensions are reasonable, do not reduce quality
  if (
    currentByteSize <= TARGET_MAX_BYTES &&
    Math.max(img.naturalWidth, img.naturalHeight) <= MAX_DOCUMENT_DIMENSION
  ) {
    return base64Data;
  }

  // Candidate max dimensions (adaptive fallback if necessary)
  const candidateDimensions = [
    MAX_DOCUMENT_DIMENSION, // 1920
    1600,
    1400,
    1200,
    1024,
  ];

  // Candidate JPEG qualities: start high to preserve OCR readability
  const qualitySteps = [0.92, 0.88, 0.84, 0.80, 0.75, 0.70, 0.65];

  for (const maxDim of candidateDimensions) {
    const { width, height } = getScaledDimensions(img.naturalWidth, img.naturalHeight, maxDim);
    const canvas = drawToCanvas(img, width, height);

    for (const quality of qualitySteps) {
      const candidateDataUrl = canvas.toDataURL('image/jpeg', quality);
      if (candidateDataUrl.length <= TARGET_MAX_BYTES) {
        console.log(
          `[IDShield Compressor] Base64 compressed: ${Math.round(currentByteSize / 1024)}KB -> ${Math.round(candidateDataUrl.length / 1024)}KB (${width}x${height} @ quality ${(quality * 100).toFixed(0)}%)`
        );
        return candidateDataUrl;
      }
    }
  }

  // Final attempt: minimum resolution with 0.60 quality
  const fallback = getScaledDimensions(img.naturalWidth, img.naturalHeight, 900);
  const fallbackCanvas = drawToCanvas(img, fallback.width, fallback.height);
  const finalAttempt = fallbackCanvas.toDataURL('image/jpeg', 0.60);

  if (finalAttempt.length <= MAX_SAFE_UPLOAD_BYTES) {
    console.log(`[IDShield Compressor] Final base64 compression fit: ${Math.round(finalAttempt.length / 1024)}KB`);
    return finalAttempt;
  }

  // Cannot safely fit below 1024 KB limit
  throw new Error(USER_FRIENDLY_TOO_LARGE_ERROR);
}

/**
 * Automatically compresses an uploaded File
 * 
 * - If already below limit and is JPEG, preserves original quality.
 * - Otherwise, resizes and re-encodes as JPEG targeting 700–900 KB.
 * - If still unable to fit, throws USER_FRIENDLY_TOO_LARGE_ERROR.
 */
export async function compressDocumentFile(file: File): Promise<File> {
  if (!file || !(file instanceof File)) {
    return file;
  }

  // If already below safe limit and is JPEG, preserve original quality
  if (
    file.size <= TARGET_MAX_BYTES &&
    (file.type === 'image/jpeg' || file.type === 'image/jpg')
  ) {
    return file;
  }

  // Read file as Data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

  const img = await loadImageElement(dataUrl);

  // If already small and dimensions are within standard range, keep it
  if (
    file.size <= TARGET_MAX_BYTES &&
    Math.max(img.naturalWidth, img.naturalHeight) <= MAX_DOCUMENT_DIMENSION
  ) {
    return file;
  }

  const candidateDimensions = [
    MAX_DOCUMENT_DIMENSION, // 1920
    1600,
    1400,
    1200,
    1024,
  ];

  const qualitySteps = [0.92, 0.88, 0.84, 0.80, 0.75, 0.70, 0.65];

  for (const maxDim of candidateDimensions) {
    const { width, height } = getScaledDimensions(img.naturalWidth, img.naturalHeight, maxDim);
    const canvas = drawToCanvas(img, width, height);

    for (const quality of qualitySteps) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality)
      );

      if (blob && blob.size <= TARGET_MAX_BYTES) {
        console.log(
          `[IDShield Compressor] File compressed: ${Math.round(file.size / 1024)}KB -> ${Math.round(blob.size / 1024)}KB (${width}x${height} @ quality ${(quality * 100).toFixed(0)}%)`
        );
        const fileName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
        return new File([blob], fileName, { type: 'image/jpeg' });
      }
    }
  }

  // Final fallback
  const fallback = getScaledDimensions(img.naturalWidth, img.naturalHeight, 900);
  const fallbackCanvas = drawToCanvas(img, fallback.width, fallback.height);
  const finalBlob = await new Promise<Blob | null>((resolve) =>
    fallbackCanvas.toBlob(resolve, 'image/jpeg', 0.60)
  );

  if (finalBlob && finalBlob.size <= MAX_SAFE_UPLOAD_BYTES) {
    console.log(`[IDShield Compressor] Final file compression fit: ${Math.round(finalBlob.size / 1024)}KB`);
    const fileName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
    return new File([finalBlob], fileName, { type: 'image/jpeg' });
  }

  throw new Error(USER_FRIENDLY_TOO_LARGE_ERROR);
}

/**
 * Sanitizes any error message to strictly prevent exposing technical 1024KB/part exceeded messages
 */
export function sanitizeUploadErrorMessage(errMessage: string | null | undefined): string {
  if (!errMessage || typeof errMessage !== 'string') {
    return 'Document screening analysis failed.';
  }
  const lower = errMessage.toLowerCase();
  if (
    lower.includes('1024') ||
    lower.includes('part exceeded') ||
    lower.includes('maximum size') ||
    lower.includes('entity too large') ||
    lower.includes('413')
  ) {
    return USER_FRIENDLY_TOO_LARGE_ERROR;
  }
  return errMessage;
}
