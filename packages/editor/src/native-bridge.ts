/**
 * Scripts injected into TenTap's prebuilt WebView editor. TipTap exposes the editor on its
 * root element (`.ProseMirror`.editor), so we can add Smart Paste without a custom bundle.
 */

export const NATIVE_LIST_PASTE_MESSAGE = 'n2-list-paste';

/**
 * Listens for paste events (capture phase, never preventing the default paste) and posts
 * `{ type, payload: { text, from, to } }` back to React Native after the paste is applied.
 */
export const nativeSmartPasteListenerScript = `(function () {
  if (window.__n2SmartPaste) return;
  window.__n2SmartPaste = true;
  document.addEventListener('paste', function (e) {
    var el = document.querySelector('.ProseMirror');
    var ed = el && el.editor;
    if (!ed || !window.ReactNativeWebView) return;
    if (ed.isActive('taskItem')) return;
    var text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    if (text.indexOf('\\n') === -1) return;
    var from = ed.state.selection.from;
    setTimeout(function () {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: '${NATIVE_LIST_PASTE_MESSAGE}',
        payload: { text: text, from: from, to: ed.state.selection.to }
      }));
    }, 0);
  }, true);
})(); true;`;
