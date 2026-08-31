#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-https://asana.imtelak.com/api/health}"
BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/prisma/backups}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/taskflow-production-deploy.lock}"
VALIDATE_ONLY=false
DEPLOY_STARTED=false
PREVIOUS_IMAGE_ID=""

# Plain progress prevents interactive Docker redraws from flooding agent logs.
export COMPOSE_PROGRESS="${COMPOSE_PROGRESS:-plain}"
export BUILDKIT_PROGRESS="${BUILDKIT_PROGRESS:-plain}"

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy-production.sh [--validate-only]

Runs the standard TaskFlow production validation and deployment workflow.

Options:
  --validate-only  Run tests, typecheck, lint, and the production build only.
  -h, --help       Show this help text.

Environment overrides:
  COMPOSE_FILE      Compose file to use (default: docker-compose.yml)
  HEALTHCHECK_URL   Public health endpoint
  BACKUP_DIR        Directory for pre-deploy PostgreSQL backups
  DEPLOY_LOCK_FILE  Host lock file preventing concurrent deployments
EOF
}

for argument in "$@"; do
  case "${argument}" in
    --validate-only)
      VALIDATE_ONLY=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: ${argument}" >&2
      usage >&2
      exit 2
      ;;
  esac
done

cd "${REPO_ROOT}"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Another production deployment is already running (${LOCK_FILE})." >&2
  exit 1
fi

log() {
  printf '\n==> %s\n' "$1"
}

deployment_failure() {
  local exit_code=$?
  echo "" >&2
  echo "Production deployment failed." >&2
  if [[ "${DEPLOY_STARTED}" == true ]]; then
    docker compose -f "${COMPOSE_FILE}" ps web >&2 || true
    docker compose -f "${COMPOSE_FILE}" logs --tail 120 web >&2 || true
    if [[ -n "${PREVIOUS_IMAGE_ID}" ]]; then
      echo "Previous asana-web image ID: ${PREVIOUS_IMAGE_ID}" >&2
    fi
  fi
  exit "${exit_code}"
}
trap deployment_failure ERR

log "Checking deployment prerequisites"
command -v docker >/dev/null
command -v curl >/dev/null
command -v flock >/dev/null
[[ -f "${COMPOSE_FILE}" ]] || { echo "Missing ${COMPOSE_FILE}" >&2; exit 1; }
[[ -f .env ]] || { echo "Missing production .env" >&2; exit 1; }
docker compose -f "${COMPOSE_FILE}" config --quiet

log "Running regression tests"
npm test

log "Running TypeScript checks"
npm run typecheck

log "Running lint"
npm run lint

log "Building the production application"
npm run build

if [[ "${VALIDATE_ONLY}" == true ]]; then
  log "Validation completed; deployment was intentionally skipped"
  exit 0
fi

PREVIOUS_IMAGE_ID="$(docker inspect --format '{{.Image}}' asana-web 2>/dev/null || true)"

log "Building the production Docker image"
docker compose -f "${COMPOSE_FILE}" build web

log "Backing up the production database"
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"
BACKUP_FILE="${BACKUP_DIR}/asana_clone_predeploy_$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose -f "${COMPOSE_FILE}" exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"${BACKUP_FILE}"
chmod 600 "${BACKUP_FILE}"
[[ -s "${BACKUP_FILE}" ]] || { echo "Database backup is empty" >&2; exit 1; }
echo "Backup: ${BACKUP_FILE}"
sha256sum "${BACKUP_FILE}"

if [[ -d prisma/migrations ]] && find prisma/migrations -mindepth 2 -name migration.sql -print -quit | grep -q .; then
  log "Applying versioned Prisma migrations"
  npm run db:migrate:deploy
else
  log "No versioned Prisma migrations found; skipping migrate deploy"
fi

log "Running idempotent project-membership normalization"
npm run db:normalize-project-members

log "Recreating asana-web"
DEPLOY_STARTED=true
docker compose -f "${COMPOSE_FILE}" up -d --no-deps web

log "Waiting for container health"
container_health=""
for _ in {1..60}; do
  container_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' asana-web 2>/dev/null || true)"
  if [[ "${container_health}" == "healthy" ]]; then
    break
  fi
  if [[ "${container_health}" == "unhealthy" ]]; then
    echo "asana-web reported unhealthy" >&2
    exit 1
  fi
  sleep 2
done
[[ "${container_health}" == "healthy" ]] || { echo "Timed out waiting for asana-web health" >&2; exit 1; }

log "Verifying public health"
curl --fail --silent --show-error --max-time 10 --retry 12 --retry-delay 2 --retry-all-errors "${HEALTHCHECK_URL}"
echo ""

CURRENT_IMAGE_ID="$(docker inspect --format '{{.Image}}' asana-web)"
docker compose -f "${COMPOSE_FILE}" ps web

log "Production deployment completed"
echo "Image: ${CURRENT_IMAGE_ID}"
echo "Health: ${HEALTHCHECK_URL}"
echo "Backup: ${BACKUP_FILE}"
