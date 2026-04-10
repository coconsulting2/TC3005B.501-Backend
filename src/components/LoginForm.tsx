/**
 * Login form — Editorial Finance design.
 * Clean off-white with serif headline and green olive CTA.
 */

import React, { useState } from "react";
import { apiRequest } from "@utils/apiClient";

export default function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest("/user/logout", { method: "GET" });

    try {
      const response = await apiRequest("/user/login", {
        method: "POST",
        data: { username, password },
      });

      setErrorMessage("");

      document.cookie = `token=${response.token}; path=/; secure; SameSite=Strict`;
      document.cookie = `role=${response.role}; path=/`;
      document.cookie = `username=${response.username}; path=/`;
      document.cookie = `user_id=${response.user_id}; path=/`;
      document.cookie = `department_id=${response.department_id}; path=/`;
      window.location.href = "/dashboard";
    } catch (error: any) {
      const msg = error?.response?.data?.error || "Error al iniciar sesión";
      setErrorMessage(msg);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        backgroundColor: "#FAFAF7",
      }}
    >
      {/* Left panel — brand + headline */}
      <div
        style={{
          width: "50%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "3rem",
          backgroundColor: "#0A0A0A",
          color: "#FAFAF7",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <img src="/Logo.svg" style={{ width: "2.5rem", height: "2.5rem" }} alt="CocoAPI" />
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            COCOAPI
          </span>
        </div>

        <div>
          <h1
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: "3rem",
              lineHeight: 1.15,
              fontWeight: 300,
              color: "#FAFAF7",
              margin: 0,
            }}
          >
            La gestión de viajes<br />
            no debería sentirse<br />
            como contabilidad.
          </h1>
          <p
            style={{
              marginTop: "1.5rem",
              fontSize: "0.875rem",
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.4)",
              maxWidth: "28rem",
            }}
          >
            Solicita, aprueba y comprueba gastos de viaje con la claridad
            que tu equipo merece. Sin hojas de cálculo, sin papel.
          </p>
        </div>

        <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.25)" }}>
          Ditta Consulting &middot; CocoAPI v0.4.2
        </p>
      </div>

      {/* Right panel — login form */}
      <div
        style={{
          width: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div style={{ width: "100%", maxWidth: "24rem" }}>
          <h2
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: "1.875rem",
              fontWeight: 300,
              color: "#0A0A0A",
              marginBottom: "0.5rem",
            }}
          >
            Iniciar sesión
          </h2>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#8A8A86",
              marginBottom: "2rem",
            }}
          >
            Ingresa tus credenciales para continuar.
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "1.25rem" }}>
              <label
                htmlFor="username"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  marginBottom: "0.375rem",
                  color: "#4A4A48",
                }}
              >
                Usuario
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tu nombre de usuario"
                style={{
                  display: "block",
                  width: "100%",
                  padding: "0.625rem 0.75rem",
                  fontSize: "0.875rem",
                  border: "1px solid #D4D3CE",
                  borderRadius: "6px",
                  backgroundColor: "#FFFFFF",
                  color: "#0A0A0A",
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#3D4A2A")}
                onBlur={(e) => (e.target.style.borderColor = "#D4D3CE")}
              />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label
                htmlFor="password"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  marginBottom: "0.375rem",
                  color: "#4A4A48",
                }}
              >
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                style={{
                  display: "block",
                  width: "100%",
                  padding: "0.625rem 0.75rem",
                  fontSize: "0.875rem",
                  border: "1px solid #D4D3CE",
                  borderRadius: "6px",
                  backgroundColor: "#FFFFFF",
                  color: "#0A0A0A",
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#3D4A2A")}
                onBlur={(e) => (e.target.style.borderColor = "#D4D3CE")}
              />
            </div>

            <button
              type="submit"
              style={{
                display: "block",
                width: "100%",
                padding: "0.625rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "#FFFFFF",
                backgroundColor: "#3D4A2A",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                transition: "background-color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#4D6138")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#3D4A2A")}
            >
              Ingresar
            </button>

            {errorMessage && (
              <div
                style={{
                  marginTop: "1rem",
                  padding: "0.75rem",
                  fontSize: "0.875rem",
                  borderLeft: "4px solid #C2410C",
                  backgroundColor: "#FEF3EE",
                  color: "#9A3009",
                  borderRadius: "6px",
                }}
              >
                {errorMessage}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
