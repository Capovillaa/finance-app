/**
 * Saving a server response to disk.
 *
 * The export endpoints are authenticated, so the file cannot be fetched by
 * pointing an `<a href>` or `window.open` at the URL — the browser would send
 * that request without the `Authorization` header and get a 401. The body is
 * fetched through the normal RTK Query base query instead (which attaches the
 * token and transparently refreshes it) and turned into a download here.
 */
export function downloadText(
  contents: string,
  filename: string,
  mimeType = 'text/csv;charset=utf-8',
): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  // Firefox only honours a click on an element that is in the document.
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoking synchronously after `click()` cancels the download in some
  // browsers, which read the blob asynchronously. One tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
