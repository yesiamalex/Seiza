/**
 * The secret this tab last unlocked editing with, for the editor's HTTP
 * calls (asset library, uploads, environment and skybox swaps).
 *
 * Editing is unlocked over the room's WebSocket, but those calls are plain
 * HTTP requests the Worker checks on their own. They used to send only an
 * `x-seiza-editor-password` header built from the edit panel's own text
 * box, so on a deployment gated by the admin key, or for an admin who
 * unlocked through the shield button instead, they carried no valid
 * credential at all and every one came back 403.
 *
 * Kept in memory only, for the life of the tab, like the WebSocket's own
 * authorization.
 */
let adminKey: string | null = null;
let editorPassword: string | null = null;

export function rememberAdminKey(key: string) {
  adminKey = key;
}

export function rememberEditorPassword(password: string) {
  editorPassword = password;
}

/** Headers proving edit access, for the Worker's /api/assets routes. */
export function editAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (adminKey) headers["x-seiza-admin-key"] = adminKey;
  if (editorPassword) headers["x-seiza-editor-password"] = editorPassword;
  return headers;
}
