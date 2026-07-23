# Matomo Tag Manager

Load a [Matomo Tag Manager](https://matomo.org/tag-manager/) (MTM) container in your Next.js app and push events to its `_mtm` data layer.

> Matomo Tag Manager is Matomo's built-in tag manager — this is **not** Google Tag Manager. If you manage your Matomo tracker through an MTM container, use this integration _instead of_ `trackAppRouter` / `trackPagesRouter` (the container injects its own tracker). You can still combine both if your container doesn't include the Matomo Analytics tag.

## Quick Start

### App Router

```tsx
// app/matomo-tag-manager.tsx
"use client";

import { useEffect } from "react";
import { initTagManager } from "@socialgouv/matomo-next";

export function MatomoTagManager() {
  useEffect(() => {
    initTagManager({
      url: process.env.NEXT_PUBLIC_MATOMO_URL,
      containerId: process.env.NEXT_PUBLIC_MATOMO_CONTAINER_ID,
    });
  }, []);

  return null;
}
```

Render it once in your root layout:

```tsx
// app/layout.tsx
import { MatomoTagManager } from "./matomo-tag-manager";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <MatomoTagManager />
      </body>
    </html>
  );
}
```

### Pages Router

```tsx
// pages/_app.tsx
import { useEffect } from "react";
import { initTagManager } from "@socialgouv/matomo-next";

export default function App({ Component, pageProps }) {
  useEffect(() => {
    initTagManager({
      url: process.env.NEXT_PUBLIC_MATOMO_URL,
      containerId: process.env.NEXT_PUBLIC_MATOMO_CONTAINER_ID,
    });
  }, []);

  return <Component {...pageProps} />;
}
```

`initTagManager` is the equivalent of the snippet Matomo shows under _Tag Manager → Install Code_: it seeds the `_mtm` data layer with the `mtm.Start` event and injects `{url}/js/container_{containerId}.js`. It is idempotent — calling it again is a no-op — so it is safe in components that re-render.

## Tracking client-side navigations (SPA)

Out of the box, an MTM container only fires its page-view triggers on the initial page load. For Next.js client-side navigations you have two options:

1. **History Change trigger (recommended)** — in Matomo, edit your container's page-view trigger and use the **History Change** trigger type (or add it alongside the Pageview trigger). The container then detects `pushState` navigations by itself — no extra code needed.

2. **Push your own events** — fire a custom event on every route change and create a matching custom-event trigger in your container:

   ```tsx
   "use client";

   import { useEffect } from "react";
   import { usePathname } from "next/navigation";
   import { pushTagManager } from "@socialgouv/matomo-next";

   export function TagManagerPageViews() {
     const pathname = usePathname();

     useEffect(() => {
       pushTagManager({ event: "route-change", pathname });
     }, [pathname]);

     return null;
   }
   ```

## Pushing events and variables

`pushTagManager` pushes any entry to the `_mtm` data layer. Use it for custom-event triggers and data-layer variables:

```ts
import { pushTagManager } from "@socialgouv/matomo-next";

// Fire a custom event your container listens to
pushTagManager({ event: "order-completed", revenue: 42 });

// Expose a data-layer variable to your tags
pushTagManager({ userStatus: "logged-in" });
```

It can be called before `initTagManager`: entries are queued in `_mtm` and processed once the container loads.

## Using the server-side proxy

If the [server-side proxy](./server-side-proxy.md) is configured via `withMatomoProxy()`, the container script is automatically loaded through your own domain (`{proxyPath}/js/container_{containerId}.js`) — you can omit `url` entirely:

```tsx
initTagManager({
  containerId: process.env.NEXT_PUBLIC_MATOMO_CONTAINER_ID,
});
```

Set `useProxy: false` to force direct calls to the Matomo instance.

> Note: the tags configured **inside** your container decide where tracking requests go. If your container includes the Matomo Analytics tag pointing at your Matomo domain, those requests are not proxied — configure the tag's Matomo URL accordingly if you need full ad-block resistance.

## Container environments

Matomo Tag Manager containers have environments (live, staging, dev…). Non-live container files carry an extra suffix in their name. Use `containerUrl` to load one of those:

```tsx
initTagManager({
  containerUrl:
    "https://analytics.example.com/js/container_aBcDeF12_staging_581d….js",
});
```

## API Reference

### `initTagManager(settings)`

| Option                 | Type         | Required | Description                                                                          |
| ---------------------- | ------------ | -------- | ------------------------------------------------------------------------------------ |
| `url`                  | `string`     | ❌       | Matomo base URL. Optional when the server-side proxy is configured                   |
| `containerId`          | `string`     | ✅\*     | Container ID (e.g. `aBcDeF12`). \*Not needed if `containerUrl` is provided           |
| `containerUrl`         | `string`     | ❌       | Full container script URL — overrides `url` + `containerId` (container environments) |
| `useProxy`             | `boolean`    | ❌       | Prefer the server-side proxy when available. Default: `true`                         |
| `nonce`                | `string`     | ❌       | CSP nonce added to the injected `<script>` tag                                       |
| `trustedPolicyName`    | `string`     | ❌       | Trusted Types policy name. Default: `"matomo-next"`                                  |
| `onScriptLoadingError` | `() => void` | ❌       | Called when the container script fails to load                                       |
| `debug`                | `boolean`    | ❌       | Log configuration problems to the console. Default: `false`                          |

### `pushTagManager(entry)`

Pushes an entry (`Record<string, unknown>`) to the `_mtm` data layer. Creates the data layer if needed, so it is safe to call before `initTagManager`.
