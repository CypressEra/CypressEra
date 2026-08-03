#!/usr/bin/env bash
# Fetch the flow-solver binary for local development.
#
# The solver is closed source and ships as a public container image; this
# pulls the image and extracts the binary — the same mechanism deploy.sh
# uses in production. See SOLVER-EULA.md for the binary's license terms.
set -euo pipefail

TAG="${1:-latest}"
IMAGE="ghcr.io/cypressera/flow-solver/cypressera-flow-solver:${TAG}"
DEST="${SOLVER_DEST:-flow-solver/target/release}"

command -v docker >/dev/null || { echo "ERROR: docker is required." >&2; exit 1; }

echo "Pulling ${IMAGE}..."
# The image is linux/amd64; --platform lets the pull succeed on arm64 hosts.
# Note: the extracted binary is a Linux binary — run it via Docker on
# macOS/Windows (the dev compose file mounts it into the api-server container).
docker pull --platform linux/amd64 "${IMAGE}"

mkdir -p "${DEST}"
container_id=$(docker create --platform linux/amd64 "${IMAGE}")
trap 'docker rm "${container_id}" >/dev/null' EXIT
docker cp "${container_id}:/app/flow-solver" "${DEST}/flow-solver"
chmod +x "${DEST}/flow-solver"

echo "flow-solver (${TAG}) extracted to ${DEST}/flow-solver"
