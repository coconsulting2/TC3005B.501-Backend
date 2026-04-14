.PHONY: seed

## seed: Seed DB with 2 test orgs, 20 users (10/org), 5 roles, 5 suppliers, MongoDB config
seed:
	node prisma/seed-orgs.js
