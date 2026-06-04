# Changelog 🥥

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),  
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Chart-of-accounts CRUD (US-24)
- Inferir roles N1/N2 en import preview
- API keys admin completo (M3-004)
- Comentarios en rechazos de recibos
- Encryption at rest en logs
- Fixtures de usabilidad CFDI/PDF

### Changed

- Normalización de username a lowercase
- Actualización de cookies TTL y CSRF token lifetime
- Refactor de expense reports para visibilidad de usuarios

### Fixed

- Org bootstrap transaction client (fix 500)
- Onboarding organizationId
- Resync id sequence en orgs
- customRoleName en roles importados
- Honor create-new-org flag

### Security

- Restringir api_key:manage a DittaSuperAdmin
- Evitar logging de API key identifiers en texto plano

### Documentation

- Swagger M3 consolidado
- Fix YAMLException en swagger.yaml
- Bump OpenAPI a 3.1.0

## [1.1.0] - 2026-04-29

### Added

- Notification center y web push (M3-006)
- Solicitud workflow APIs y historial
- CFDI validación SAT
- Permisos granulares M2-001
- Workflow rules engine M2-004
- Swagger UI en `/api-docs`

### Documentation

- swagger-m2.yaml (NT-015)
- Postman collections M1/M2

## [1.0.0] - 2026-04-07

### Added

- Migración completa a PostgreSQL + Prisma ORM
- Migración de pnpm a Bun
- Docker containerización (dev + GHCR)
- CFDI XML parser SAT v3.3/v4.0
- Accounting export API (M1-010)
- Exchange rate Wise/Banxico (M1-008)
- AWS S3 storage
- Health endpoint
- Seed scripts

### Changed

- **BREAKING:** MariaDB → PostgreSQL + Prisma
- **BREAKING:** pnpm → Bun

### Security

- scrypt async para api_keys.key_hash
- HMAC-SHA256 con pepper
- Protección de rutas admin
- multer actualizado

## [0.4.0] - 2025-06-12: Login + Configuration

### Security

- Validation and sanitization of endpoints and databases
- JWT authentication for endpoint authentication
- Improve encryption method

### Added

- Testing of endpoints.
- Create one or multiple users
- Delete a user
- Edit a user
- Login

## [0.3.0] - 2025-05-27: Post-Trip Flow

### Security

- Input validation

### Added

- Send an Applicant's receipts to Accounts Payable
- Approval or Rejection of a Receipt
- Create an expense validation
- Obtain a user's total balance in order to request a refund or payment
- Creating and submitting a Request Draft
- File Repository for Receipts
- Automatic DB Setup

### Changed

- Obtaining a user's information will now include their department and whether
  or not they are active

- Import SQL Files rather than creating a pool during the Setup

- Dummy Data to more accurately represent a company

## [0.2.0] - 2025-05-21: Request Follow-Up

### Added

- View a User's requests (active + completed)

- Authorizers can retrieve travel requests that they need to attend according
  to their role.

- Authorizers can change the status of a travel request according to certain
  role and status conditions.

- Travel Agents can change the status of a travel request according to certain
  role and status conditions.

- Request Modification

- Request Cancellation

### Fix

- Requests without a Route

## [0.1.0] - 2025-05-21: Pre-Trip Flow

### Security

- Certificates can be generated to use https protocol.

### Added

- DB Scheme.

- Dummy Data Setup for Use.

- User Request and Profile data fetching.

- Travel Request Creation.

- Applicant can retrieve data of completed or cancelled requests.

[Unreleased]: https://github.com/coconsulting2/TC3005B.501-Backend/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/coconsulting2/TC3005B.501-Backend/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/coconsulting2/TC3005B.501-Backend/compare/v0.4.0...v1.0.0
[0.4.0]: https://github.com/coconsulting2/TC3005B.501-Backend/releases/tag/v0.4.0
[0.3.0]: https://github.com/coconsulting2/TC3005B.501-Backend/releases/tag/v0.3.0
[0.2.0]: https://github.com/coconsulting2/TC3005B.501-Backend/releases/tag/v0.2.0
[0.1.0]: https://github.com/coconsulting2/TC3005B.501-Backend/releases/tag/v0.1.0
