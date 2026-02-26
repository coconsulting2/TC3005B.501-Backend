/**
 * @module applicantService
 * @description Service layer for applicant-related operations: route formatting,
 * travel request cancellation, expense validation, and country/city resolution.
 */

import Applicant from "../models/applicantModel.js";

/**
 * @param {Object} mainRoute - Primary route with origin/destination and schedule fields
 * @param {Object[]} [additionalRoutes=[]] - Extra route legs with the same shape
 * @returns {Object[]} Merged array of route objects with default fallbacks for additional routes
 */
export const formatRoutes = (mainRoute, additionalRoutes = []) => {
    return [
        {
            origin_country_name: mainRoute.origin_country_name,
            origin_city_name: mainRoute.origin_city_name,
            destination_country_name: mainRoute.destination_country_name,
            destination_city_name: mainRoute.destination_city_name,
            router_index: mainRoute.router_index,
            beginning_date: mainRoute.beginning_date,
            beginning_time: mainRoute.beginning_time,
            ending_date: mainRoute.ending_date,
            ending_time: mainRoute.ending_time,
            plane_needed: mainRoute.plane_needed,
            hotel_needed: mainRoute.hotel_needed,
        },
        ...additionalRoutes.map((route) => ({
            router_index: route.router_index,
            origin_country_name: route.origin_country_name || "notSelected",
            origin_city_name: route.origin_city_name || "notSelected",
            destination_country_name: route.destination_country_name || "notSelected",
            destination_city_name: route.destination_city_name || "notSelected",
            beginning_date: route.beginning_date || "0000-01-01",
            beginning_time: route.beginning_time || "00:00:00",
            ending_date: route.ending_date || "0000-01-01",
            ending_time: route.ending_time || "00:00:00",
            plane_needed: route.plane_needed || false,
            hotel_needed: route.hotel_needed || false,
        })),
    ];
};

/**
 * Calculates total trip days from the first route's start to the last route's end.
 *
 * @param {Object[]} routes - Array of route objects with beginning_date/time and ending_date/time
 * @returns {number} Number of days (rounded up) spanning the entire trip, or 0 if empty
 */
export const getRequestDays = (routes) => {
    if (!routes || routes.length === 0) return 0;

    const sortedRoutes = routes.sort((a, b) => a.router_index - b.router_index);

    const firstRoute = sortedRoutes[0];
    const lastRoute = sortedRoutes[sortedRoutes.length - 1];

    const startDate = new Date(
        `${firstRoute.beginning_date}T${firstRoute.beginning_time}`,
    );
    const endDate = new Date(
        `${lastRoute.ending_date}T${lastRoute.ending_time}`,
    );

    const diffInMs = endDate - startDate;
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

    return Math.ceil(diffInDays);
};

/**
 * Validates that a travel request can be cancelled, then cancels it.
 *
 * @param {number} request_id - ID of the travel request to cancel
 * @returns {Promise<Object>} Confirmation with request_id, status 9, and active: false
 * @throws {{ status: number, message: string }} If request is not found or not in a cancellable state
 */
export const cancelTravelRequestValidation = async (request_id) => {
    try {
        const status_id = await Applicant.getRequestStatus(request_id);
        if (status_id === null) {
            throw { status: 404, message: "Travel request not found" };
        }

        if (![1, 2, 3, 4, 5, 9].includes(status_id)) {
            throw {
                status: 400,
                message:
                    "Request cannot be cancelled after reaching 'Atención Agencia de Viajes'",
            };
        } else if (status_id == 9) {
            throw {
                status: 400,
                message: "Request has already been cancelled.",
            };
        }

        await Applicant.cancelTravelRequest(request_id);

        return {
            message: "Travel request cancelled successfully",
            request_id,
            request_status_id: 9,
            active: false,
        };
    } catch (err) {
        console.error("Error in cancelTravelRequest service:", err);
        throw err;
    }
};

/**
 * Validates and inserts a batch of expense receipts.
 *
 * @param {Object[]} receipts - Array of receipt objects
 * @param {number} receipts[].receipt_type_id - Type identifier for the receipt
 * @param {number} receipts[].request_id - Associated travel request ID
 * @param {number} receipts[].amount - Receipt amount
 * @returns {Promise<number>} Number of successfully inserted receipts
 * @throws {Error} If receipts is not a non-empty array or items lack required numeric fields
 */
export const createExpenseValidationBatch = async (receipts) => {
    if (!Array.isArray(receipts) || receipts.length === 0) {
        const err = new Error('The "receipts" field must be a non-empty array');
        err.code = "BAD_REQUEST";
        throw err;
    }

    for (const r of receipts) {
        if (
            typeof r.receipt_type_id !== "number" ||
            typeof r.request_id !== "number" ||
            typeof r.amount !== "number"
        ) {
            const err = new Error(
                'Each receipt must include "receipt_type_id", "request_id", and "amount" (all as numbers)'
            );
            err.code = "BAD_REQUEST";
            throw err;
        }
    }

    const insertedCount = await Applicant.createExpenseBatch(receipts);
    return insertedCount;
};

/**
 * Looks up a country by name; inserts it if it does not exist.
 *
 * @param {Object} conn - MariaDB connection or pool instance
 * @param {string} countryName - Name of the country to find or create
 * @returns {Promise<number>} The country_id (existing or newly inserted)
 */
export const getCountryId = async (conn, countryName) => {
    const countryQuery = `SELECT country_id FROM Country WHERE country_name = ?`;
    const [countryRows] = await conn.query(countryQuery, [countryName]);

    if (countryRows === undefined) {
        const insertCountryQuery = `INSERT INTO Country (country_name) VALUES (?)`;
        const insertedCountry = await conn.execute(insertCountryQuery, [
            countryName,
        ]);
        return insertedCountry.insertId;
    } else {
        return countryRows.country_id;
    }
};

/**
 * Looks up a city by name; inserts it if it does not exist.
 *
 * @param {Object} conn - MariaDB connection or pool instance
 * @param {string} cityName - Name of the city to find or create
 * @returns {Promise<number>} The city_id (existing or newly inserted)
 */
export const getCityId = async (conn, cityName) => {
    const cityQuery = `SELECT city_id FROM City WHERE city_name = ?`;
    const [cityRows] = await conn.query(cityQuery, [cityName]);

    if (cityRows === undefined) {
        const insertCityQuery = `INSERT INTO City (city_name) VALUES (?)`;
        const insertedCity = await conn.execute(insertCityQuery, [cityName]);
        return insertedCity.insertId;
    } else {
        return cityRows.city_id;
    }
};

/**
 * Advances a request from status 6 (expense proof) to status 7 (receipt validation).
 *
 * @param {number} requestId - ID of the travel request
 * @returns {Promise<Object>} Confirmation with request_id, updated_status 7, and a message
 * @throws {Error} If request is not found (404) or not in status 6 (400)
 */
export const sendReceiptsForValidation = async (requestId) => {
    const currentStatus = await Applicant.getRequestStatus(requestId);

    if (currentStatus === null) {
        const err = new Error(`No request found with id ${requestId}`);
        err.status = 404;
        throw err;
    }

    if (currentStatus !== 6) {
        const err = new Error(
            "Request must be in status 6 (Comprobación gastos del viaje) to send for validation"
        );
        err.status = 400;
        throw err;
    }

    await Applicant.updateRequestStatusToValidationStage(requestId);

    return {
        request_id: Number(requestId),
        updated_status: 7,
        message: "Request status updated to 'Validación de comprobantes'",
    };
};
