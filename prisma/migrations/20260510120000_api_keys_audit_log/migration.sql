-- Tablas api_keys y api_key_logs (panel admin para integraciones; SHA-256 hex del secreto).

CREATE TABLE "api_keys" (
    "id" SERIAL NOT NULL,
    "org_id" BIGINT NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "scope" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

CREATE INDEX "api_keys_org_id_idx" ON "api_keys"("org_id");

ALTER TABLE "api_keys"
    ADD CONSTRAINT "api_keys_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "User"("user_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "api_key_logs" (
    "id" BIGSERIAL NOT NULL,
    "key_id" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "response_code" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_key_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "api_key_logs_key_id_timestamp_idx"
    ON "api_key_logs"("key_id", "timestamp" DESC);

ALTER TABLE "api_key_logs"
    ADD CONSTRAINT "api_key_logs_key_id_fkey"
    FOREIGN KEY ("key_id") REFERENCES "api_keys"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
