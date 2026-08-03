import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config/api';

// Defaults mirror api-server's services.platformVersionDefault /
// platformBuildDefault. When /api/version has not yet succeeded (initial mount,
// network down, server 5xx) the hook returns these so the About modal never
// renders an empty cell or a misleading hard-coded value — and the React
// fallbacks are the same strings api-server itself emits when its
// PLATFORM_VERSION / PLATFORM_BUILD envs are unset.
const PLATFORM_VERSION_DEFAULT = '0.0.0';
const PLATFORM_BUILD_DEFAULT = 'development';

export interface PlatformInfo {
  version: string;
  build: string;
}

// useVersion returns the platform identity reported by GET /api/version:
// the platform version and the build channel.
//
// The version is the only source of the version string surfaced to users (the
// About modal, etc.) — the api-server resolves PLATFORM_VERSION once at startup
// and stamps the same value onto every newly-saved study-result, so this hook
// guarantees the About modal and freshly-produced ACCC results display
// byte-identical version strings. The build channel reflects the deployment
// environment (e.g. development / production).
//
// The hook seeds with the defaults and re-fetches on window focus so a user
// who leaves the tab open across a deploy catches up to the new platform
// identity the next time they look at the app.
export function useVersion(): PlatformInfo {
  const [info, setInfo] = useState<PlatformInfo>({
    version: PLATFORM_VERSION_DEFAULT,
    build: PLATFORM_BUILD_DEFAULT,
  });

  useEffect(() => {
    let cancelled = false;

    const fetchVersion = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/version`);
        if (!res.ok) return;
        const body = (await res.json()) as { version?: unknown; build?: unknown };
        if (cancelled) return;
        setInfo((prev) => ({
          version:
            typeof body.version === 'string' && body.version.length > 0
              ? body.version
              : prev.version,
          build:
            typeof body.build === 'string' && body.build.length > 0
              ? body.build
              : prev.build,
        }));
      } catch {
        // Network or parse error: leave the previously-known values in place
        // (the defaults on first failed fetch).
      }
    };

    fetchVersion();
    const onFocus = () => {
      fetchVersion();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return info;
}
