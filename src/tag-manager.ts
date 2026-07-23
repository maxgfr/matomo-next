/**
 * Matomo Tag Manager (MTM) integration.
 *
 * Loads a Matomo Tag Manager container and exposes a typed helper to push
 * entries to the `_mtm` data layer. Works with both the App Router and the
 * Pages Router, and integrates with the server-side proxy
 * (`withMatomoProxy()`) so the container script can be served from your own
 * domain.
 *
 * @module tag-manager
 */

import type { HTMLTrustedScriptElement } from "./types";
import { createSanitizer } from "./utils";
import { getProxyPath, getProxyUrl } from "./server-proxy";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An entry pushed to the Matomo Tag Manager `_mtm` data layer */
export type TagManagerDataLayerEntry = Record<string, unknown>;

declare global {
  interface Window {
    /** Matomo Tag Manager data layer */
    _mtm?: TagManagerDataLayerEntry[];
  }
}

/** Options for {@link initTagManager} */
export interface TagManagerSettings {
  /**
   * Matomo base URL (e.g. "https://analytics.example.com").
   *
   * When using the server-side proxy (`withMatomoProxy()`), you can omit this
   * and the library will automatically load the container through
   * `NEXT_PUBLIC_MATOMO_PROXY_PATH` (so the browser only talks to your own
   * domain).
   */
  url?: string;
  /**
   * Container ID, as shown in Matomo → Tag Manager → your container
   * (e.g. "aBcDeF12"). The container script is loaded from
   * `{url}/js/container_{containerId}.js`.
   */
  containerId?: string;
  /**
   * Full container script URL. Takes precedence over `url` + `containerId`.
   *
   * Useful for non-live container environments, whose file names carry an
   * extra suffix (e.g. `container_aBcDeF12_staging_….js`).
   */
  containerUrl?: string;
  /**
   * When `true` (default), and if `NEXT_PUBLIC_MATOMO_PROXY_PATH` is defined,
   * the container is loaded through the server-side proxy instead of the
   * provided `url`.
   *
   * @default true
   */
  useProxy?: boolean;
  /** CSP nonce added to the injected `<script>` tag */
  nonce?: string;
  /**
   * Name of the Trusted Types policy used for the script URL.
   *
   * @default "matomo-next"
   */
  trustedPolicyName?: string;
  /** Called when the container script fails to load */
  onScriptLoadingError?: () => void;
  /** Log configuration problems to the console */
  debug?: boolean;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let initialized = false;

/**
 * Reset the module state so `initTagManager` can run again.
 *
 * @internal Exposed for tests.
 */
export function resetTagManager(): void {
  initialized = false;
}

// ---------------------------------------------------------------------------
// initTagManager
// ---------------------------------------------------------------------------

/**
 * Loads a Matomo Tag Manager container.
 *
 * Seeds the `_mtm` data layer with the `mtm.Start` event and injects the
 * container script — the equivalent of the snippet Matomo shows under
 * _Tag Manager → Install Code_. Safe to call from a `useEffect`: subsequent
 * calls are no-ops.
 *
 * Note: out of the box, Matomo Tag Manager only tracks the initial page load.
 * For client-side navigations (App Router / Pages Router route changes),
 * enable a **History Change** trigger in your container, or push your own
 * events with {@link pushTagManager}.
 *
 * @example
 * ```tsx
 * "use client";
 *
 * import { useEffect } from "react";
 * import { initTagManager } from "@socialgouv/matomo-next";
 *
 * export function MatomoTagManager() {
 *   useEffect(() => {
 *     initTagManager({
 *       url: process.env.NEXT_PUBLIC_MATOMO_URL,
 *       containerId: process.env.NEXT_PUBLIC_MATOMO_CONTAINER_ID,
 *     });
 *   }, []);
 *
 *   return null;
 * }
 * ```
 */
export function initTagManager(settings: TagManagerSettings): void {
  const {
    url,
    containerId,
    containerUrl,
    useProxy = true,
    nonce,
    trustedPolicyName = "matomo-next",
    onScriptLoadingError,
    debug = false,
  } = settings;

  // SSR guard — the container can only be loaded in the browser
  if (typeof window === "undefined") {
    return;
  }

  if (initialized) {
    return;
  }

  // Resolve the container script URL. Like the tracker, prefer the proxy
  // *path* (relative URL) so the browser resolves it against the current
  // origin and your Matomo domain never appears in the page.
  const resolvedSrc = (() => {
    if (containerUrl) {
      return containerUrl;
    }

    if (!containerId) {
      if (debug) {
        console.warn(
          "Matomo Tag Manager disabled, please provide `containerId` (or a full `containerUrl`).",
        );
      }
      return null;
    }

    const proxyBaseUrl = useProxy ? (getProxyPath() ?? getProxyUrl()) : null;
    const baseUrl = proxyBaseUrl ?? url;

    if (!baseUrl) {
      if (debug) {
        console.warn(
          "Matomo Tag Manager disabled, please provide `url` or configure the server-side proxy via withMatomoProxy().",
        );
      }
      return null;
    }

    return `${baseUrl.replace(/\/+$/, "")}/js/container_${containerId}.js`;
  })();

  if (!resolvedSrc) {
    return;
  }

  initialized = true;

  // Seed the data layer with the start event (same as the official snippet)
  window._mtm = window._mtm ?? [];
  window._mtm.push({
    "mtm.startTime": new Date().getTime(),
    event: "mtm.Start",
  });

  const sanitizer = createSanitizer(trustedPolicyName);
  const scriptElement: HTMLTrustedScriptElement =
    document.createElement("script");

  if (nonce) {
    scriptElement.setAttribute("nonce", nonce);
  }

  scriptElement.type = "text/javascript";
  scriptElement.async = true;
  scriptElement.src = sanitizer.createScriptURL?.(resolvedSrc) ?? resolvedSrc;

  if (onScriptLoadingError) {
    scriptElement.onerror = () => {
      onScriptLoadingError();
    };
  }

  const refElement = document.getElementsByTagName("script")[0];
  if (refElement?.parentNode) {
    refElement.parentNode.insertBefore(scriptElement, refElement);
  } else {
    document.head.appendChild(scriptElement);
  }
}

// ---------------------------------------------------------------------------
// pushTagManager
// ---------------------------------------------------------------------------

/**
 * Push an entry to the Matomo Tag Manager `_mtm` data layer.
 *
 * Use it to fire custom events your container's triggers listen to, or to
 * expose variables to your tags. Can be called before `initTagManager` —
 * entries are queued and processed once the container loads.
 *
 * @example
 * ```ts
 * import { pushTagManager } from "@socialgouv/matomo-next";
 *
 * pushTagManager({ event: "order-completed", revenue: 42 });
 * ```
 */
export function pushTagManager(entry: TagManagerDataLayerEntry): void {
  if (typeof window === "undefined") {
    return;
  }

  window._mtm = window._mtm ?? [];
  window._mtm.push(entry);
}
