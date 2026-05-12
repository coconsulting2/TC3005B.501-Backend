/**
 * @file tests/services/anticipoPolizaLifecycleService.test.js
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

process.env.NODE_ENV ??= "test";

const mockPrisma = {
    request: {
        findUnique: jest.fn(),
    },
    anticipoPolizaSnapshot: {
        create: jest.fn(),
    },
};

await jest.unstable_mockModule("../../database/config/prisma.js", () => ({
    default: mockPrisma,
}));

const {
    onTravelRequestFullyApproved,
    onExpensesVerified,
    ON_TRAVEL_APPROVED,
    ON_EXPENSES_VERIFIED,
} = await import("../../services/anticipoPolizaLifecycleService.js");

beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.anticipoPolizaSnapshot.create.mockResolvedValue({});
});

describe("anticipoPolizaLifecycleService", () => {
    test("onTravelRequestFullyApproved no persiste si requestedFee es 0", async () => {
        mockPrisma.request.findUnique.mockResolvedValue({ requestedFee: 0 });
        await onTravelRequestFullyApproved(10);
        expect(mockPrisma.anticipoPolizaSnapshot.create).not.toHaveBeenCalled();
    });

    test("onTravelRequestFullyApproved persiste AV con requested_fee", async () => {
        mockPrisma.request.findUnique
            .mockResolvedValueOnce({ requestedFee: 7500 })
            .mockResolvedValueOnce({
                requestId: 10,
                userId: 3,
                organizationId: 99n,
            });
        await onTravelRequestFullyApproved(10);
        expect(mockPrisma.anticipoPolizaSnapshot.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                organizationId: 99n,
                requestId: 10,
                phase: ON_TRAVEL_APPROVED,
                payload: expect.objectContaining({
                    header: expect.objectContaining({ DOC_TYPE: "AV" }),
                }),
            }),
        });
    });

    test("onExpensesVerified no persiste si imposedFee ausente", async () => {
        mockPrisma.request.findUnique.mockResolvedValue({ imposedFee: null });
        await onExpensesVerified(10);
        expect(mockPrisma.anticipoPolizaSnapshot.create).not.toHaveBeenCalled();
    });

    test("onExpensesVerified persiste AV con imposed_fee", async () => {
        mockPrisma.request.findUnique
            .mockResolvedValueOnce({ imposedFee: 8200 })
            .mockResolvedValueOnce({
                requestId: 11,
                userId: 4,
                organizationId: 1n,
            });
        await onExpensesVerified(11);
        expect(mockPrisma.anticipoPolizaSnapshot.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                requestId: 11,
                phase: ON_EXPENSES_VERIFIED,
            }),
        });
    });
});
