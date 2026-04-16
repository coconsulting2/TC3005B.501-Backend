/**
 * @file createTestAuthToken.js
 * @description Utility module for generating JWT test tokens for authentication testing.
 * Provides functions to create signed JWT tokens with different user roles and configurations.
 * Includes predefined role constants used throughout the application.
 */

import jwt from "jsonwebtoken";


let ids = 0;

export function createTestJWT(role, options) {
    return jwt.sign(
        {
            user_id: options?.user_id ?? ++ids,
            role: role,
            ip: options?.IP ?? "127.0.0.1"
        },
        process.env.JWT_SECRET,
        { expiresIn: options?.expiresIn ?? "1h" }
    );
}

export const ROLES = {
    SOLICITING: "Solicitante",
    TRAVEL_AGENT: "Agencia de viajes",
    ACCOUNTS_PAYABLE: "Cuentas por pagar",
    N1: "N1",
    N2: "N2",
    ADMIN: "Administrador"
};

export const LOCALHOST = "127.0.0.1";

