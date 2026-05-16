/* ════════════════════════════════════════════════════════════════════════
   SPReconciler — single global version constant.

   index.html loads this via <script src="version.js?_=<ts>"> with a
   per-pageload cache-buster so a deployed bump is picked up immediately.
   The auto-update poller fetches THIS file (not the HTML) and looks for
   the literal substring "APP_VERSION = '<target>'".

   Workflow on every deploy:
     1. Edit window.APP_VERSION here.
     2. UPDATE apa_core.apps SET version=$NEW WHERE app_name='SPReconciler'.
     3. git push.
   ════════════════════════════════════════════════════════════════════════ */
window.APP_VERSION = '0.3';
