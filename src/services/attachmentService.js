/**
 * Attachment service — pick, compress, and upload screenshots to the feedback
 * attachments bucket. Keeps FeedbackScreen dumb: the screen just calls
 * `pickScreenshots()` and `uploadAttachment()` and gets back refs it can pass
 * to `api.feedback.submit()`.
 *
 * Flow:
 *   1. pickScreenshots()         → user picks from photo library
 *   2. compressIfNeeded(uri)     → downscale to max 1600px, JPEG 80
 *   3. getUploadUrl()            → server returns a signed upload URL
 *   4. uploadToSignedUrl()       → PUT bytes directly to Supabase Storage
 *   5. submit feedback with attachment refs → server persists metadata rows
 *
 * Failure handling:
 *   - Each step catches its own errors and returns a structured result
 *   - The screen shows per-file status (uploading / uploaded / failed)
 *   - We never block feedback submission if ONE attachment fails — user can
 *     submit text feedback without the problem screenshot
 */
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { getSession } from './authService';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
const MAX_ATTACHMENTS = 6;
const MAX_BYTES = 10 * 1024 * 1024;   // match server
const TARGET_MAX_DIM = 1600;           // screenshots at 3x density can be huge
const TARGET_QUALITY = 0.8;            // JPEG compression

/**
 * Ask for library permission (if not already granted).
 * Returns { granted: boolean, canAskAgain: boolean }.
 */
export async function ensureLibraryPermission() {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.status === 'granted') {
    return { granted: true, canAskAgain: true };
  }
  const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return { granted: req.status === 'granted', canAskAgain: req.canAskAgain };
}

/**
 * Open the system photo picker. Returns an array of picked assets, each with
 * a local `uri`, `width`, `height`, `fileSize` (if available), and a
 * best-effort `mimeType`. Empty array if the user cancels.
 */
export async function pickScreenshots({ maxCount = MAX_ATTACHMENTS, alreadyPicked = 0 } = {}) {
  const remaining = Math.max(0, maxCount - alreadyPicked);
  if (remaining === 0) return [];

  const perm = await ensureLibraryPermission();
  if (!perm.granted) {
    const err = new Error('Photo library permission was not granted');
    err.code = 'PERMISSION_DENIED';
    err.canAskAgain = perm.canAskAgain;
    throw err;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: 1,   // we do our own compression
    exif: false,  // don't leak location metadata
  });

  if (result.canceled) return [];

  return (result.assets || []).map(a => ({
    uri: a.uri,
    width: a.width || null,
    height: a.height || null,
    fileSize: a.fileSize || null,
    mimeType: a.mimeType || guessMimeFromUri(a.uri),
  }));
}

/**
 * If the image is larger than TARGET_MAX_DIM, downscale and re-encode as JPEG.
 * If it's already small enough, return the original.
 *
 * Returns { uri, width, height, mimeType, sizeBytes }.
 */
export async function compressIfNeeded(asset) {
  const needsResize =
    (asset.width && asset.width > TARGET_MAX_DIM) ||
    (asset.height && asset.height > TARGET_MAX_DIM) ||
    (asset.fileSize && asset.fileSize > 1_500_000);

  let workingUri = asset.uri;
  let workingWidth = asset.width;
  let workingHeight = asset.height;
  let workingMime = asset.mimeType;

  if (needsResize) {
    const scale = asset.width && asset.height
      ? TARGET_MAX_DIM / Math.max(asset.width, asset.height)
      : 1;
    const resizeWidth  = asset.width  ? Math.round(asset.width  * Math.min(1, scale)) : TARGET_MAX_DIM;
    const resizeHeight = asset.height ? Math.round(asset.height * Math.min(1, scale)) : null;

    const actions = [];
    if (resizeHeight) actions.push({ resize: { width: resizeWidth, height: resizeHeight } });
    else              actions.push({ resize: { width: resizeWidth } });

    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      actions,
      { compress: TARGET_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );
    workingUri = manipulated.uri;
    workingWidth = manipulated.width;
    workingHeight = manipulated.height;
    workingMime = 'image/jpeg';
  } else if (workingMime === 'image/heic' || workingMime === 'image/heif') {
    // HEIC isn't widely supported by our server's allowed MIME list on the wire,
    // but Supabase allows it. We still convert to JPEG for broadest compatibility
    // so Linear's markdown can render thumbnails.
    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      [],
      { compress: TARGET_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );
    workingUri = manipulated.uri;
    workingWidth = manipulated.width;
    workingHeight = manipulated.height;
    workingMime = 'image/jpeg';
  }

  // Read file size from the final URI.
  const info = await FileSystem.getInfoAsync(workingUri);
  const sizeBytes = info?.size || 0;

  if (sizeBytes > MAX_BYTES) {
    const err = new Error('Screenshot is too large even after compression');
    err.code = 'TOO_LARGE';
    throw err;
  }

  return {
    uri: workingUri,
    width: workingWidth,
    height: workingHeight,
    mimeType: workingMime || 'image/jpeg',
    sizeBytes,
  };
}

/**
 * Ask the server for a signed upload URL for this content-type + size.
 */
async function getUploadUrl({ contentType, sizeBytes }) {
  const session = await getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${BASE_URL}/api/feedback/attachment-upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ contentType, sizeBytes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Upload URL request failed (${res.status})`);
  }
  return res.json();
}

/**
 * Upload the file bytes directly to Supabase storage via the signed URL.
 * Uses FileSystem.uploadAsync so we don't load the whole file into memory.
 */
async function uploadToSignedUrl(localUri, uploadUrl, contentType) {
  const result = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Upload failed (${result.status}): ${result.body?.slice(0, 200)}`);
  }
}

/**
 * Public: given an already-compressed asset, get a signed URL, upload, and
 * return the attachment ref the server expects in POST /api/feedback.
 */
export async function uploadAttachment(compressed) {
  const { uploadUrl, storagePath } = await getUploadUrl({
    contentType: compressed.mimeType,
    sizeBytes:   compressed.sizeBytes,
  });

  await uploadToSignedUrl(compressed.uri, uploadUrl, compressed.mimeType);

  return {
    storagePath,
    mimeType:  compressed.mimeType,
    sizeBytes: compressed.sizeBytes,
    width:     compressed.width,
    height:    compressed.height,
  };
}

/**
 * Convenience: compress + upload in one call.
 */
export async function processAndUpload(asset) {
  const compressed = await compressIfNeeded(asset);
  return uploadAttachment(compressed);
}

// ── Internals ────────────────────────────────────────────────────────────────
function guessMimeFromUri(uri) {
  const ext = (uri.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'png':  return 'image/png';
    case 'webp': return 'image/webp';
    case 'heic': return 'image/heic';
    case 'heif': return 'image/heif';
    case 'jpg':
    case 'jpeg':
    default:     return 'image/jpeg';
  }
}

export const ATTACHMENT_LIMITS = {
  maxCount: MAX_ATTACHMENTS,
  maxBytes: MAX_BYTES,
};

// Unused but useful for debugging
export { Platform };
