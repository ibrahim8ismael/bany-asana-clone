.DEFAULT_GOAL := help

.PHONY: help
help: ## Show available targets
	@grep -E '^[a-zA-Z0-9_.-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-28s\033[0m %s\n", $$1, $$2}'

.PHONY: dev
dev: ## Start Next.js dev server
	npm run dev

.PHONY: build
build: ## Production build
	npm run build

.PHONY: start
start: ## Start production server
	npm run start

.PHONY: lint
lint: ## Run ESLint
	npm run lint

.PHONY: lint-fix
lint-fix: ## Run ESLint with --fix
	npm run lint -- --fix

.PHONY: typecheck
typecheck: ## Generate Next types and run tsc --noEmit
	npm run typecheck

.PHONY: test
test: ## Run node test suite
	npm test

.PHONY: check
check: ## Full validation: lint + typecheck + test
	npm run lint && npm run typecheck && npm test

.PHONY: db-generate
db-generate: ## prisma generate
	npm run db:generate

.PHONY: db-setup
db-setup: ## Ensure SQLite database, generate client, apply migrations
	npm run db:setup

.PHONY: db-status
db-status: ## Show Prisma migration status
	npm run db:status

.PHONY: db-migrate-dev
db-migrate-dev: ## Create/apply a development migration
	npm run db:migrate:dev

.PHONY: db-migrate-deploy
db-migrate-deploy: ## Apply pending migrations
	npm run db:migrate:deploy

.PHONY: db-normalize-project-members
db-normalize-project-members: ## Normalize project member roles
	npm run db:normalize-project-members

.PHONY: db-seed
db-seed: ## Seed database (never against production)
	npm run db:seed

.PHONY: audit-client-tasks
audit-client-tasks: ## Audit Asana-imported client tasks
	npm run audit:client-tasks

.PHONY: skills-build
skills-build: ## Rebuild skills manifest
	npm run skills:build

.PHONY: deploy-production
deploy-production: ## Validate, backup DB, migrate, redeploy asana-web
	npm run deploy:production

.PHONY: validate-only
validate-only: ## Run deployment validation without deploying
	./scripts/deploy-production.sh --validate-only
