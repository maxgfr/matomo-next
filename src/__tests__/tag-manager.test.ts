import {
  initTagManager,
  pushTagManager,
  resetTagManager,
} from "../tag-manager";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** All container <script> tags injected by initTagManager */
function getInjectedScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll("script"));
}

function getDataLayer(): Record<string, unknown>[] {
  return (window._mtm as Record<string, unknown>[]) ?? [];
}

// ---------------------------------------------------------------------------
// setup / teardown
// ---------------------------------------------------------------------------

const originalEnv = process.env;

beforeEach(() => {
  resetTagManager();
  delete window._mtm;
  document
    .querySelectorAll("script")
    .forEach((script) => script.parentNode?.removeChild(script));
  process.env = { ...originalEnv };
  delete process.env.NEXT_PUBLIC_MATOMO_PROXY_PATH;
});

afterEach(() => {
  process.env = originalEnv;
});

// ---------------------------------------------------------------------------
// initTagManager
// ---------------------------------------------------------------------------

describe("initTagManager", () => {
  it("should inject the container script from url + containerId", () => {
    initTagManager({
      url: "https://analytics.example.com",
      containerId: "aBcDeF12",
    });

    const scripts = getInjectedScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe(
      "https://analytics.example.com/js/container_aBcDeF12.js",
    );
    expect(scripts[0].async).toBe(true);
  });

  it("should seed the _mtm data layer with the mtm.Start event", () => {
    initTagManager({
      url: "https://analytics.example.com",
      containerId: "aBcDeF12",
    });

    const dataLayer = getDataLayer();
    expect(dataLayer).toHaveLength(1);
    expect(dataLayer[0].event).toBe("mtm.Start");
    expect(typeof dataLayer[0]["mtm.startTime"]).toBe("number");
  });

  it("should preserve entries already queued in _mtm", () => {
    window._mtm = [{ event: "early-bird" }];

    initTagManager({
      url: "https://analytics.example.com",
      containerId: "aBcDeF12",
    });

    const dataLayer = getDataLayer();
    expect(dataLayer[0]).toEqual({ event: "early-bird" });
    expect(dataLayer[1].event).toBe("mtm.Start");
  });

  it("should be idempotent (second call injects nothing)", () => {
    initTagManager({
      url: "https://analytics.example.com",
      containerId: "aBcDeF12",
    });
    initTagManager({
      url: "https://analytics.example.com",
      containerId: "aBcDeF12",
    });

    expect(getInjectedScripts()).toHaveLength(1);
    expect(getDataLayer()).toHaveLength(1);
  });

  it("should strip the trailing slash from url", () => {
    initTagManager({
      url: "https://analytics.example.com/",
      containerId: "aBcDeF12",
    });

    expect(getInjectedScripts()[0].src).toBe(
      "https://analytics.example.com/js/container_aBcDeF12.js",
    );
  });

  it("should set the nonce attribute when provided", () => {
    initTagManager({
      url: "https://analytics.example.com",
      containerId: "aBcDeF12",
      nonce: "my-nonce",
    });

    expect(getInjectedScripts()[0].getAttribute("nonce")).toBe("my-nonce");
  });

  it("should use containerUrl verbatim when provided", () => {
    initTagManager({
      containerUrl:
        "https://analytics.example.com/js/container_aBcDeF12_staging_1234.js",
    });

    expect(getInjectedScripts()[0].src).toBe(
      "https://analytics.example.com/js/container_aBcDeF12_staging_1234.js",
    );
  });

  it("should call onScriptLoadingError when the script fails to load", () => {
    const onScriptLoadingError = jest.fn();

    initTagManager({
      url: "https://analytics.example.com",
      containerId: "aBcDeF12",
      onScriptLoadingError,
    });

    getInjectedScripts()[0].onerror?.(new Event("error"));
    expect(onScriptLoadingError).toHaveBeenCalledTimes(1);
  });

  it("should use the server-side proxy path when configured", () => {
    process.env.NEXT_PUBLIC_MATOMO_PROXY_PATH = "/api/a1234567890";

    initTagManager({ containerId: "aBcDeF12" });

    const scripts = getInjectedScripts();
    expect(scripts).toHaveLength(1);
    // jsdom resolves relative src against http://localhost
    expect(scripts[0].src).toBe(
      "http://localhost/api/a1234567890/js/container_aBcDeF12.js",
    );
  });

  it("should prefer the proxy over an explicit url by default", () => {
    process.env.NEXT_PUBLIC_MATOMO_PROXY_PATH = "/api/a1234567890";

    initTagManager({
      url: "https://analytics.example.com",
      containerId: "aBcDeF12",
    });

    expect(getInjectedScripts()[0].src).toBe(
      "http://localhost/api/a1234567890/js/container_aBcDeF12.js",
    );
  });

  it("should ignore the proxy when useProxy is false", () => {
    process.env.NEXT_PUBLIC_MATOMO_PROXY_PATH = "/api/a1234567890";

    initTagManager({
      url: "https://analytics.example.com",
      containerId: "aBcDeF12",
      useProxy: false,
    });

    expect(getInjectedScripts()[0].src).toBe(
      "https://analytics.example.com/js/container_aBcDeF12.js",
    );
  });

  it("should be a no-op without url, proxy or containerUrl", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    initTagManager({ containerId: "aBcDeF12", debug: true });

    expect(getInjectedScripts()).toHaveLength(0);
    expect(window._mtm).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("should be a no-op without containerId or containerUrl", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    initTagManager({ url: "https://analytics.example.com", debug: true });

    expect(getInjectedScripts()).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("should allow a new init after resetTagManager", () => {
    initTagManager({
      url: "https://analytics.example.com",
      containerId: "aBcDeF12",
    });
    resetTagManager();
    initTagManager({
      url: "https://analytics.example.com",
      containerId: "aBcDeF12",
    });

    expect(getInjectedScripts()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// pushTagManager
// ---------------------------------------------------------------------------

describe("pushTagManager", () => {
  it("should push an entry to the _mtm data layer", () => {
    initTagManager({
      url: "https://analytics.example.com",
      containerId: "aBcDeF12",
    });

    pushTagManager({ event: "my-event", value: 42 });

    const dataLayer = getDataLayer();
    expect(dataLayer[dataLayer.length - 1]).toEqual({
      event: "my-event",
      value: 42,
    });
  });

  it("should create the _mtm data layer when pushing before init", () => {
    pushTagManager({ event: "early-bird" });

    expect(getDataLayer()).toEqual([{ event: "early-bird" }]);
  });
});
