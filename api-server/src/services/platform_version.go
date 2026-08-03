package services

import (
	"os"
	"sync"
)

// platformVersionEnv is the environment variable carrying the platform-version
// string. It is set by product-deploy/deploy.sh from product-deploy/VERSION.
const platformVersionEnv = "PLATFORM_VERSION"

// platformVersionDefault is the value reported when PLATFORM_VERSION is unset
// or empty (local development, ad-hoc go run, test runs that do not set the
// env, or any deploy that bypasses product-deploy/deploy.sh).
const platformVersionDefault = "0.0.0"

var (
	platformVersionOnce   sync.Once
	platformVersionCached string
)

// PlatformVersion returns the single platform-version string this api-server
// process reports. It is resolved once from the PLATFORM_VERSION environment
// variable at first call and cached for the lifetime of the process — the
// /api/version handler and the study-result Save() path both call this so
// they cannot disagree about the version of a single running process.
func PlatformVersion() string {
	platformVersionOnce.Do(func() {
		v := os.Getenv(platformVersionEnv)
		if v == "" {
			v = platformVersionDefault
		}
		platformVersionCached = v
	})
	return platformVersionCached
}

// resetPlatformVersionForTest clears the cached value so a test can run
// PlatformVersion() against a freshly-set env. Not exported; tests in the
// same package use it directly.
func resetPlatformVersionForTest() {
	platformVersionOnce = sync.Once{}
	platformVersionCached = ""
}
