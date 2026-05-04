-- CreateEnum
CREATE TYPE "policy_exception_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Request" ADD COLUMN "trip_end_date" DATE;
ALTER TABLE "Request" ADD COLUMN "policy_evaluation_snapshot" JSONB;

-- CreateTable
CREATE TABLE "employee_category" (
    "category_id" SERIAL NOT NULL,
    "org_id" BIGINT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(254),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_category_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "travel_policy" (
    "policy_id" SERIAL NOT NULL,
    "org_id" BIGINT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "category_id" INTEGER,
    "destination_scope" VARCHAR(20) NOT NULL DEFAULT 'any',
    "costs_center" VARCHAR(20),
    "daily_per_diem" DECIMAL(18,4),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'MXN',
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_policy_pkey" PRIMARY KEY ("policy_id")
);

-- CreateTable
CREATE TABLE "policy_expense_cap" (
    "cap_id" SERIAL NOT NULL,
    "policy_id" INTEGER NOT NULL,
    "receipt_type_id" INTEGER NOT NULL,
    "cap_amount" DECIMAL(18,4) NOT NULL,
    "cap_unit" VARCHAR(20) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'MXN',

    CONSTRAINT "policy_expense_cap_pkey" PRIMARY KEY ("cap_id")
);

-- CreateTable
CREATE TABLE "policy_exception" (
    "exception_id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "receipt_id" INTEGER,
    "policy_id" INTEGER,
    "cap_id" INTEGER,
    "amount_claimed" DECIMAL(18,4) NOT NULL,
    "amount_allowed" DECIMAL(18,4),
    "excess_amount" DECIMAL(18,4) NOT NULL,
    "justification" TEXT NOT NULL,
    "status" "policy_exception_status" NOT NULL DEFAULT 'PENDING',
    "requested_by_id" INTEGER NOT NULL,
    "decided_by_id" INTEGER,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_exception_pkey" PRIMARY KEY ("exception_id")
);

-- CreateTable
CREATE TABLE "reimbursement_time_limit" (
    "limit_id" SERIAL NOT NULL,
    "org_id" BIGINT NOT NULL,
    "days_after_trip" INTEGER NOT NULL DEFAULT 14,
    "grace_days" INTEGER NOT NULL DEFAULT 0,
    "block_on_expiry" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" INTEGER,

    CONSTRAINT "reimbursement_time_limit_pkey" PRIMARY KEY ("limit_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_category_org_id_code_key" ON "employee_category"("org_id", "code");

-- CreateIndex
CREATE INDEX "employee_category_org_id_active_idx" ON "employee_category"("org_id", "active");

-- CreateIndex
CREATE INDEX "travel_policy_org_id_active_valid_from_valid_to_idx" ON "travel_policy"("org_id", "active", "valid_from", "valid_to");

-- CreateIndex
CREATE INDEX "travel_policy_org_id_costs_center_idx" ON "travel_policy"("org_id", "costs_center");

-- CreateIndex
CREATE UNIQUE INDEX "policy_expense_cap_policy_id_receipt_type_id_cap_unit_key" ON "policy_expense_cap"("policy_id", "receipt_type_id", "cap_unit");

-- CreateIndex
CREATE INDEX "policy_exception_request_id_status_idx" ON "policy_exception"("request_id", "status");

-- CreateIndex
CREATE INDEX "policy_exception_status_created_at_idx" ON "policy_exception"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "reimbursement_time_limit_org_id_key" ON "reimbursement_time_limit"("org_id");

-- CreateIndex
CREATE INDEX "Request_request_status_id_trip_end_date_idx" ON "Request"("request_status_id", "trip_end_date");

-- AddForeignKey
ALTER TABLE "travel_policy" ADD CONSTRAINT "travel_policy_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "employee_category"("category_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_expense_cap" ADD CONSTRAINT "policy_expense_cap_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "travel_policy"("policy_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_expense_cap" ADD CONSTRAINT "policy_expense_cap_receipt_type_id_fkey" FOREIGN KEY ("receipt_type_id") REFERENCES "Receipt_Type"("receipt_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_exception" ADD CONSTRAINT "policy_exception_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "Request"("request_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_exception" ADD CONSTRAINT "policy_exception_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "Receipt"("receipt_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_exception" ADD CONSTRAINT "policy_exception_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "travel_policy"("policy_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_exception" ADD CONSTRAINT "policy_exception_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_exception" ADD CONSTRAINT "policy_exception_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimbursement_time_limit" ADD CONSTRAINT "reimbursement_time_limit_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
