/**
 * @module applicantModel
 * Model for applicant-related database operations including travel requests, drafts, and expenses.
 */
import pool from "../database/config/db.js";
import { formatRoutes, getRequestDays, getCountryId, getCityId } from "../services/applicantService.js";

const Applicant = {
    /**
     * Finds an applicant user by their ID.
     *
     * @param {number} id - The user ID to search for
     * @returns {Promise<Object>} The user record
     */
    async findById(id) {
        let conn;
        try {
            conn = await pool.getConnection();
            const rows = await conn.query("SELECT * FROM User WHERE user_id = ?", [
                id,
            ]);
            return rows[0];
        } catch (error) {
            console.error("Error finding applicant by ID:", error);
            throw error;
        } finally {
            if (conn) {
                conn.release();
            }
        }
    },

    /**
     * Finds the cost center and department name for a given user.
     *
     * @param {number} userId - The user ID
     * @returns {Promise<Object>} The department name and cost center
     */
    async findCostCenterByUserId(userId) {
        let conn;

        try {
            conn = await pool.getConnection();
            const rows = await conn.query(
                `
                SELECT d.department_name, d.costs_center FROM User u
                JOIN Department d
                ON u.department_id = d.department_id
                WHERE u.user_id = ?;
            `,
                [userId],
            );
            return rows[0];

        } catch (error) {
            console.error("Error finding cost center by ID:", error);
            throw error;
        } finally {
            if (conn) {
                conn.release();
            }
        }
    },

    /**
     * Creates a new travel request with routes for a given user.
     *
     * @param {number} userId - The ID of the requesting user
     * @param {Object} travelDetails - The travel request details including routes
     * @returns {Promise<{requestId: number, message: string}>} The created request ID and confirmation message
     */
    async createTravelRequest(userId, travelDetails) {
        let conn;
        try {
            conn = await pool.getConnection();
            await conn.beginTransaction();

            const {
                router_index,
                notes,
                requested_fee = 0,
                imposed_fee = 0,
                origin_country_name,
                origin_city_name,
                destination_country_name,
                destination_city_name,
                beginning_date,
                beginning_time,
                ending_date,
                ending_time,
                plane_needed,
                hotel_needed,
                additionalRoutes = [],
            } = travelDetails;

            const allRoutes = formatRoutes(
                {
                    router_index,
                    origin_country_name,
                    origin_city_name,
                    destination_country_name,
                    destination_city_name,
                    beginning_date,
                    beginning_time,
                    ending_date,
                    ending_time,
                    plane_needed,
                    hotel_needed,
                },
                additionalRoutes,
            );

            // Step 1: Insert into Request table
            const request_days = getRequestDays(allRoutes);

            const role = await conn.query(
                `SELECT role_id FROM User WHERE user_id = ?`,
                [userId],
            );

            // Determine request status based on user role
            let request_status;
            if (role[0].role_id == 1) {
                request_status = 2; // First Revision
            }
            else if (role[0].role_id == 4) {
                request_status = 3; // Second Revision
            }
            else if (role[0].role_id == 5) {
                request_status = 4; // Trip Quote
            }
            else {
                throw new Error("User role in not allowed to create a travel request");
            }

            const insertIntoRequestTable = `
                INSERT INTO Request (
                user_id, request_status_id, notes, requested_fee, imposed_fee, request_days
                ) VALUES (?, ?, ?, ?, ?, ?)
            `;

            const requestTableResult = await conn.execute(insertIntoRequestTable, [
                userId,
                request_status,
                notes,
                requested_fee,
                imposed_fee,
                request_days,
            ]);

            const requestId = requestTableResult.insertId;

            // Step 2: Insert routes with country and city lookups
            for (const route of allRoutes) {
                try {
                    let
                        id_origin_country,
                        id_destination_country,
                        id_origin_city,
                        id_destination_city;

                    id_origin_country = await getCountryId(conn, route.origin_country_name);
                    id_destination_country = await getCountryId(conn, route.destination_country_name);

                    id_origin_city = await getCityId(conn, route.origin_city_name);
                    id_destination_city = await getCityId(conn, route.destination_city_name);

                    const insertRouteTable = `
                    INSERT INTO Route (
                        id_origin_country, id_origin_city,
                        id_destination_country, id_destination_city,
                        router_index, plane_needed, hotel_needed,
                        beginning_date, beginning_time,
                        ending_date, ending_time
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;

                    const routeTableResult = await conn.query(insertRouteTable, [
                        id_origin_country,
                        id_origin_city,
                        id_destination_country,
                        id_destination_city,
                        route.router_index,
                        route.plane_needed,
                        route.hotel_needed,
                        route.beginning_date,
                        route.beginning_time,
                        route.ending_date,
                        route.ending_time,
                    ]);

                    const routeId = routeTableResult.insertId;

                    // Step 3: Link route to request
                    const insertIntoRouteRequestTable = `
                    INSERT INTO Route_Request (request_id, route_id) VALUES (?, ?)
                    `;
                    await conn.query(insertIntoRouteRequestTable, [requestId, routeId]);
                } catch (error) {
                    console.error("Error processing route:", error);
                    throw new Error("Database Error: Unable to process route");
                }
            }

            await conn.commit();

            return {
                requestId: Number(requestId),
                message: "Travel request successfully created",
            };
        } catch (error) {
            if (conn) await conn.rollback();
            console.error("Error creating travel request:", error);
            throw new Error("Database Error: Unable to fill Request table");
        } finally {
            if (conn) conn.release();
        }
    },

    /**
     * Edits an existing travel request by replacing its routes and updating details.
     *
     * @param {number} requestId - The ID of the request to edit
     * @param {Object} travelChanges - The updated travel request details
     * @returns {Promise<{requestId: number, message: string}>} The updated request ID and confirmation message
     */
    async editTravelRequest(requestId, travelChanges) {
        let conn;
        try {
            conn = await pool.getConnection();
            await conn.beginTransaction();

            const {
                router_index,
                notes,
                requested_fee = 0,
                imposed_fee = 0,
                origin_country_name,
                origin_city_name,
                destination_country_name,
                destination_city_name,
                beginning_date,
                beginning_time,
                ending_date,
                ending_time,
                plane_needed,
                hotel_needed,
                additionalRoutes = [],
            } = travelChanges;

            const allRoutes = formatRoutes(
                {
                    router_index,
                    origin_country_name,
                    origin_city_name,
                    destination_country_name,
                    destination_city_name,
                    beginning_date,
                    beginning_time,
                    ending_date,
                    ending_time,
                    plane_needed,
                    hotel_needed,
                },
                additionalRoutes
            );

            // Step 1: Update Request table
            const request_days = getRequestDays(allRoutes);

            const updateRequestTable = `
                UPDATE Request SET
                notes = ?,
                requested_fee = ?,
                imposed_fee = ?,
                request_days = ?,
                last_mod_date = CURRENT_TIMESTAMP
                WHERE request_id = ?
            `;

            await conn.execute(updateRequestTable, [
                notes,
                requested_fee,
                imposed_fee,
                request_days,
                requestId,
            ]);

            // Step 2: Delete old routes
            const oldRoutesIds = await conn.query(
                `SELECT route_id FROM Route_Request WHERE request_id = ?`,
                [requestId]
            );

            const deleteRouteRequest = `
                DELETE FROM Route_Request WHERE request_id = ?
            `;
            await conn.execute(deleteRouteRequest, [requestId]);

            for (const route_id of oldRoutesIds) {
                const deleteRoute = `
                DELETE FROM Route WHERE route_id = ?
                `;
                await conn.execute(deleteRoute, [route_id.route_id]);
            }

            // Step 3: Insert new routes
            for (const route of allRoutes) {
                try {
                    let
                        id_origin_country,
                        id_destination_country,
                        id_origin_city,
                        id_destination_city;

                    id_origin_country = await getCountryId(conn, route.origin_country_name);
                    id_destination_country = await getCountryId(conn, route.destination_country_name);

                    id_origin_city = await getCityId(conn, route.origin_city_name);
                    id_destination_city = await getCityId(conn, route.destination_city_name);

                    const insertRouteTable = `
                    INSERT INTO Route (
                        id_origin_country, id_origin_city,
                        id_destination_country, id_destination_city,
                        router_index, plane_needed, hotel_needed,
                        beginning_date, beginning_time,
                        ending_date, ending_time
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;

                    const routeTableResult = await conn.query(insertRouteTable, [
                        id_origin_country,
                        id_origin_city,
                        id_destination_country,
                        id_destination_city,
                        route.router_index,
                        route.plane_needed,
                        route.hotel_needed,
                        route.beginning_date,
                        route.beginning_time,
                        route.ending_date,
                        route.ending_time,
                    ]);

                    const routeId = routeTableResult.insertId;

                    const insertIntoRouteRequestTable = `
                    INSERT INTO Route_Request (request_id, route_id) VALUES (?, ?)
                    `;
                    await conn.query(insertIntoRouteRequestTable, [requestId, routeId]);
                } catch (error) {
                    console.error("Error processing route:", error);
                    throw new Error("Database Error: Unable to process route");
                }
            }

            await conn.commit();
            return {
                requestId: Number(requestId),
                message: "Travel request successfully updated",
            };

        } catch (error) {
            if (conn) await conn.rollback();
            console.error("Error editing travel request:", error);
            throw new Error("Database Error: Unable to edit travel request");
        } finally {
            if (conn) conn.release();
        }
    },

    /**
     * Gets the current status ID of a request.
     *
     * @param {number} requestId - The request ID
     * @returns {Promise<number|null>} The request status ID or null if not found
     */
    async getRequestStatus(requestId) {
        let conn;
        const query = `SELECT request_status_id FROM Request WHERE request_id = ?`;
        try {
            conn = await pool.getConnection();
            const rows = await conn.query(query, [requestId]);
            return rows.length > 0 ? rows[0].request_status_id : null;
        } catch (error) {
            console.error("Error getting request status:", error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    },

    /**
     * Cancels a travel request by setting its status to 9 (Cancelado).
     *
     * @param {number} requestId - The request ID to cancel
     * @returns {Promise<boolean>} True if cancelled successfully
     */
    async cancelTravelRequest(requestId) {
        let conn;
        const query = `
        UPDATE Request
        SET request_status_id = 9
        WHERE request_id = ?
        `;
        try {
            conn = await pool.getConnection();
            await conn.query(query, [requestId]);
            return true;
        } catch (error) {
            console.error("Error cancelling request:", error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    },

    /**
     * Gets all completed, cancelled, or rejected requests for a user.
     *
     * @param {number} userId - The user ID
     * @returns {Promise<Array<Object>>} List of completed request records
     */
    async getCompletedRequests(userId) {
        let conn;
        const query = `
        SELECT request_id,
            origin_countries,
            destination_countries,
            beginning_dates,
            ending_dates,
            creation_date,
            status
        FROM RequestWithRouteDetails
        WHERE user_id = ?
            AND status IN ('Finalizado', 'Cancelado', 'Rechazado')
        `;
        try {
            conn = await pool.getConnection();
            const rows = await conn.query(query, [userId]);
            return rows;
        } catch (error) {
            console.error("Error getting completed requests:", error);
            throw error;
        } finally {
            if (conn) {
                conn.release();
            }
        }
    },

    /**
     * Gets all active (non-finalized) travel requests for a user.
     *
     * @param {number} userId - The user ID
     * @returns {Promise<Array<Object>>} List of active request summaries
     */
    async getApplicantRequests(userId) {
        let conn;
        const query = `
      SELECT
        r.request_id,
        rs.status AS status,
        c.country_name AS destination_country,
        ro.beginning_date,
        ro.ending_date
      FROM Request r
      JOIN Route_Request rr ON r.request_id = rr.request_id
      JOIN Route ro ON rr.route_id = ro.route_id
      JOIN Country c ON ro.id_destination_country = c.country_id
      JOIN Request_status rs ON r.request_status_id = rs.request_status_id
      WHERE r.user_id = ?
        AND r.request_status_id NOT IN (8, 9, 10)
      GROUP BY r.request_id
    `;
        try {
            conn = await pool.getConnection();
            const rows = await conn.query(query, [userId]);
            return rows;
        } catch (error) {
            console.error("Error in getApplicantRequests:", error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    },

    /**
     * Gets detailed information for a single travel request including all routes.
     *
     * @param {number} userId - The request ID to look up
     * @returns {Promise<Array<Object>>} The request details with route information
     */
    async getApplicantRequest(userId) {
        let conn;
        const query = `
      SELECT
        r.request_id,
        rs.status AS request_status,
        r.notes,
        r.requested_fee,
        r.imposed_fee,
        r.request_days,
        r.creation_date,
        r.last_mod_date,
        u.user_name,
        u.email AS user_email,
        u.phone_number AS user_phone_number,

        co1.country_name AS origin_country,
        ci1.city_name AS origin_city,
        co2.country_name AS destination_country,
        ci2.city_name AS destination_city,

        ro.router_index,
        ro.beginning_date,
        ro.beginning_time,
        ro.ending_date,
        ro.ending_time,
        ro.hotel_needed,
        ro.plane_needed

      FROM Request r
      JOIN User u ON r.user_id = u.user_id
      JOIN Request_status rs ON r.request_status_id = rs.request_status_id
      LEFT JOIN Route_Request rr ON r.request_id = rr.request_id
      LEFT JOIN Route ro ON rr.route_id = ro.route_id
      LEFT JOIN Country co1 ON ro.id_origin_country = co1.country_id
      LEFT JOIN City ci1 ON ro.id_origin_city = ci1.city_id
      LEFT JOIN Country co2 ON ro.id_destination_country = co2.country_id
      LEFT JOIN City ci2 ON ro.id_destination_city = ci2.city_id

      WHERE r.request_id = ?
      ORDER BY ro.router_index ASC
    `;
        try {
            conn = await pool.getConnection();
            const rows = await conn.query(query, [userId]);
            return rows;
        } catch (error) {
            console.error("Error in getApplicantRequest:", error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    },

    /**
     * Inserts multiple receipts in a single transaction.
     *
     * @param {Array<{receipt_type_id: number, request_id: number, amount: number}>} receipts - Array of receipt objects
     * @returns {Promise<number>} Number of inserted rows
     */
    async createExpenseBatch(receipts) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            const insertedRows = [];

            for (const r of receipts) {
                const result = await conn.query(
                    `INSERT INTO Receipt (receipt_type_id, request_id, amount)
                VALUES (?, ?, ?)`,
                    [r.receipt_type_id, r.request_id, r.amount]
                );
                insertedRows.push(result);
            }

            await conn.commit();
            return insertedRows.length;
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    },

    /**
     * Creates a draft travel request with status "Abierto" (1).
     *
     * @param {number} userId - The ID of the requesting user
     * @param {Object} savedDetails - The draft travel request details with default values
     * @returns {Promise<{requestId: number, message: string}>} The created draft ID and confirmation message
     */
    async createDraftTravelRequest(userId, savedDetails) {
        let conn;
        try {
            conn = await pool.getConnection();
            await conn.beginTransaction();

            const {
                router_index = 0,
                notes = "",
                requested_fee = 0,
                imposed_fee = 0,
                origin_country_name = "notSelected",
                origin_city_name = "notSelected",
                destination_country_name = "notSelected",
                destination_city_name = "notSelected",
                beginning_date = "0000-01-01",
                beginning_time = "00:00:00",
                ending_date = "0000-01-01",
                ending_time = "00:00:00",
                plane_needed = false,
                hotel_needed = false,
                additionalRoutes = [],
                router_index = 0,                               // Default value 0
                notes = "",                                     // Default value empty string
                requested_fee = 0,                              // Default value 0
                imposed_fee = 0,                                // Default value 0
                origin_country_name = "notSelected",            // Default value 'notSelected'
                origin_city_name = "notSelected",               // Default value 'notSelected'
                destination_country_name = "notSelected",       // Default value 'notSelected'
                destination_city_name = "notSelected",          // Default value 'notSelected'
                beginning_date = "0000-01-01",                  // Default value '0000-01-01'
                beginning_time = "00:00:00",                    // Default value '00:00:00'
                ending_date = "0000-01-01",                     // Default value '0000-01-01'
                ending_time = "00:00:00",                       // Default value '00:00:00'
                plane_needed = false,                           // Default value false
                hotel_needed = false,                           // Default value false
                additionalRoutes = [],                          // Default value empty array
            } = savedDetails;

            const allRoutes = formatRoutes(
                {
                    router_index,
                    origin_country_name,
                    origin_city_name,
                    destination_country_name,
                    destination_city_name,
                    beginning_date,
                    beginning_time,
                    ending_date,
                    ending_time,
                    plane_needed,
                    hotel_needed,
                },
                additionalRoutes
            );

            // Step 1: Insert into Request table
            const request_days = getRequestDays(allRoutes);

            const insertIntoRequestTable = `
            INSERT INTO Request (
                user_id, request_status_id, notes, requested_fee, imposed_fee, request_days
                ) VALUES (?, ?, ?, ?, ?, ?)
                `;

            const requestTableResult = await conn.execute(insertIntoRequestTable, [
                userId,
                1, // Status 1 = "Abierto"
                notes,
                requested_fee,
                imposed_fee,
                request_days,
            ]);

            const requestId = requestTableResult.insertId;

            // Step 2: Insert routes with country and city lookups
            for (const route of allRoutes) {
                try {
                    let
                        id_origin_country,
                        id_destination_country,
                        id_origin_city,
                        id_destination_city;

                    id_origin_country = await getCountryId(conn, route.origin_country_name);
                    id_destination_country = await getCountryId(conn, route.destination_country_name);

                    id_origin_city = await getCityId(conn, route.origin_city_name);
                    id_destination_city = await getCityId(conn, route.destination_city_name);

                    const insertRouteTable = `
                    INSERT INTO Route (
                        id_origin_country, id_origin_city,
                        id_destination_country, id_destination_city,
                        router_index, plane_needed, hotel_needed,
                        beginning_date, beginning_time,
                        ending_date, ending_time
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;

                    // Execute the query to insert into Route table
                    const routeTableResult = await conn.query(insertRouteTable, [
                        id_origin_country,
                        id_origin_city,
                        id_destination_country,
                        id_destination_city,
                        route.router_index,
                        route.plane_needed,
                        route.hotel_needed,
                        route.beginning_date,
                        route.beginning_time,
                        route.ending_date,
                        route.ending_time,
                    ]);

                    const routeId = routeTableResult.insertId;

                    // Step 3: Link route to request
                    const insertIntoRouteRequestTable = `
                    INSERT INTO Route_Request (request_id, route_id) VALUES (?, ?)
                    `;
                    await conn.query(insertIntoRouteRequestTable, [requestId, routeId]);

                } catch (error) {
                    console.error("Error processing route:", error);
                    throw new Error("Database Error: Unable to process route");

                }
            }
            await conn.commit();
            return {
                requestId: Number(requestId),
                message: "Draft travel request successfully created",
            };

        } catch (error) {
            console.error("Error creating draft travel request:", error);
            throw new Error("Database Error: Unable to fill Request table");
        }
    },

    /**
     * Confirms a draft travel request by updating its status based on the user role.
     *
     * @param {number} userId - The ID of the user confirming the draft
     * @param {number} requestId - The ID of the draft request to confirm
     * @returns {Promise<{requestId: number, message: string}>} The confirmed request ID and message
     */
    async confirmDraftTravelRequest(userId, requestId) {
        let conn;
        try {
            conn = await pool.getConnection();
            await conn.beginTransaction();

            // Determine request status based on user role
            const role = await conn.query(
                `SELECT role_id FROM User WHERE user_id = ?`,
                [userId],
            );
            let request_status;
            if (role[0].role_id == 1) {
                request_status = 2; // First Revision
            }
            else if (role[0].role_id == 4) {
                request_status = 3; // Second Revision
            }
            else if (role[0].role_id == 5) {
                request_status = 4; // Trip Quote
            }
            else {
                throw new Error("User role in not allowed to create a travel request");
            }

            const updateRequestStatus = `
                UPDATE Request
                SET request_status_id = ?, last_mod_date = CURRENT_TIMESTAMP
                WHERE request_id = ?
            `;

            await conn.execute(updateRequestStatus, [
                request_status,
                requestId,
            ]);

            await conn.commit();
            return {
                requestId: Number(requestId),
                message: "Draft travel request successfully confirmed",
            };

        } catch (error) {
            console.error("Error confirming draft travel request:", error);
            throw new Error("Database Error: Unable to confirm draft travel request");
        }
    },

    /**
     * Gets the current status ID of a request (overrides earlier definition).
     *
     * @param {number} requestId - The request ID
     * @returns {Promise<number|null>} The request status ID or null if not found
     */
    async getRequestStatus(requestId) {
        let conn;
        try {
            conn = await pool.getConnection();
            const rows = await conn.query(
                `SELECT request_status_id FROM Request WHERE request_id = ?`,
                [requestId]
            );
            return rows[0]?.request_status_id || null;
        } finally {
            if (conn) conn.release();
        }
    },

    /**
     * Updates a request status to the validation stage (status 7).
     *
     * @param {number} requestId - The request ID to update
     * @returns {Promise<void>}
     */
    async updateRequestStatusToValidationStage(requestId) {
        let conn;
        try {
            conn = await pool.getConnection();
            await conn.query(
                `UPDATE Request SET request_status_id = 7 WHERE request_id = ?`,
                [requestId]
            );
        } finally {
            if (conn) conn.release();
        }
    },

    /**
     * Deletes a receipt by ID
     * @param receiptId
     */
    async deleteReceipt(receiptId) {
        let conn;
        try {
            conn = await pool.getConnection();
            await conn.beginTransaction();

            // First check if the receipt exists
            const [receipt] = await conn.query(
                `SELECT * FROM Receipt WHERE receipt_id = ?`,
                [receiptId]
            );

            if (!receipt) {
                throw new Error("Receipt not found");
            }

            // Delete the receipt
            const result = await conn.query(
                `DELETE FROM Receipt WHERE receipt_id = ?`,
                [receiptId]
            );

            if (result.affectedRows === 0) {
                throw new Error("Failed to delete receipt");
            }

            await conn.commit();
            return true;
        } catch (error) {
            if (conn) await conn.rollback();
            console.error("Error deleting receipt:", error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }
};

export default Applicant;
