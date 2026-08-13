export const OFFICIAL_EXTENSION_ID = 'fnbhllmhjamdfnfjlmipkcefbjnfnhej';

export type ExtensionConnectionState =
  | { kind: 'unavailable' }
  | { kind: 'installed'; version: string | null }
  | { kind: 'installed_signed_in'; version: string | null };

type ExternalResponse = {
  success?: unknown;
  installed?: unknown;
  authenticated?: unknown;
  version?: unknown;
};

type RuntimeApi = {
  lastError?: { message?: string };
  sendMessage: (
    extensionId: string,
    message: { type: string; protocolVersion: number },
    callback: (response?: ExternalResponse) => void,
  ) => void;
};

export function parseExtensionConnectionResponse(response: ExternalResponse | null | undefined): ExtensionConnectionState {
  if (!response || response.success !== true || response.installed !== true) {
    return { kind: 'unavailable' };
  }
  const version = typeof response.version === 'string' && response.version.length <= 40
    ? response.version
    : null;
  return response.authenticated === true
    ? { kind: 'installed_signed_in', version }
    : { kind: 'installed', version };
}

/**
 * Ask only the official extension for a coarse connection status. The response
 * never contains tokens, account IDs, profile data, or recommendation data.
 */
export function detectExtensionConnection(timeoutMs = 900): Promise<ExtensionConnectionState> {
  if (typeof window === 'undefined') return Promise.resolve({ kind: 'unavailable' });
  const runtime = (window as Window & { chrome?: { runtime?: RuntimeApi } }).chrome?.runtime;
  if (!runtime?.sendMessage) return Promise.resolve({ kind: 'unavailable' });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (state: ExtensionConnectionState) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(state);
    };
    const timer = window.setTimeout(() => finish({ kind: 'unavailable' }), timeoutMs);
    try {
      runtime.sendMessage(
        OFFICIAL_EXTENSION_ID,
        { type: 'STREAMING_HELPER_CONNECTION_STATUS', protocolVersion: 1 },
        (response) => {
          if (runtime.lastError) {
            finish({ kind: 'unavailable' });
            return;
          }
          finish(parseExtensionConnectionResponse(response));
        },
      );
    } catch {
      finish({ kind: 'unavailable' });
    }
  });
}
