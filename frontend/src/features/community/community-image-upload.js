import { ApiError } from '../../services/api.js';

export function uploadCommunityImages(post, images, acknowledgementId, onProgress, signal, createRequest = () => new XMLHttpRequest()) {
  return new Promise((resolve, reject) => {
    const request = createRequest();
    const abort = () => request.abort();
    const finish = (error, result) => { signal?.removeEventListener('abort', abort); if (error) reject(error); else resolve(result); };
    request.open('POST', '/api/community/with-images'); request.withCredentials = true; request.timeout = 600000;
    request.setRequestHeader('X-Community-Acknowledgement', acknowledgementId);
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    request.onload = () => {
      let payload;
      try { payload = JSON.parse(request.responseText); } catch { /* Use a safe error below. */ }
      if (request.status >= 200 && request.status < 300 && payload?.post) return finish(null, payload);
      if (request.status === 401) window.dispatchEvent(new CustomEvent('ewaguard:session-expired'));
      finish(new ApiError(request.status, payload?.error?.code ?? 'REQUEST_FAILED', 'Image upload could not complete.'));
    };
    request.onerror = () => finish(new ApiError(0, 'REQUEST_FAILED', 'Image upload could not complete.'));
    request.ontimeout = request.onerror;
    request.onabort = () => finish(new DOMException('Upload cancelled', 'AbortError'));
    const form = new FormData();
    form.append('title', post.title.trim()); form.append('body', post.body.trim()); form.append('category', post.category);
    images.forEach((image) => form.append('images', image));
    if (signal?.aborted) return finish(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true }); request.send(form);
  });
}
