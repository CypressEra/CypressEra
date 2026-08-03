package services

import (
	"os"
	"sync"
)

// platformBuildEnv is the environment variable carrying the build channel. It
// is set per-deploy by product-deploy/deploy.sh (and docker-compose), unlike
// PLATFORM_VERSION which comes from a committed VERSION file — the build
// channel describes where a release runs, not what was released.
const platformBuildEnv = "PLATFORM_BUILD"

// platformBuildDefault is the channel reported when PLATFORM_BUILD is unset or
// empty (local development, ad-hoc go run, test runs, or a bare docker compose
// up that bypasses product-deploy/deploy.sh). The deploy script sets
// "production"; everything else is "development".
const platformBuildDefault = "development"

var (
	platformBuildOnce   sync.Once
	platformBuildCached string
)

// PlatformBuild returns the build channel this api-server process reports
// (e.g. "development" or "production"). Resolved once from the PLATFORM_BUILD
// environment variable at first call and cached for the process lifetime,
// mirroring PlatformVersion so the /api/version handler reports a stable value.
func PlatformBuild() string {
	platformBuildOnce.Do(func() {
		v := os.Getenv(platformBuildEnv)
		if v == "" {
			v = platformBuildDefault
		}
		platformBuildCached = v
	})
	return platformBuildCached
}

// resetPlatformBuildForTest clears the cached value so a test can run
// PlatformBuild() against a freshly-set env. Not exported; tests in the same
// package use it directly.
func resetPlatformBuildForTest() {
	platformBuildOnce = sync.Once{}
	platformBuildCached = ""
}
