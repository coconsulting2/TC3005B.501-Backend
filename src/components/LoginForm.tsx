/**
 * Login — split 50/50 editorial (dark brand panel + cream form).
 * Identidad: "Editorial Finance"
 *
 * Layout:
 *  • Mobile  → panel oscuro mínimo (sin lista valor); sin scroll en el hero.
 *              Formulario flex-1 (scroll solo si no cabe en pantallas muy bajas).
 *  • Desktop: 50/50. Panel izq.: self-stretch; md: flex-1 entre hero y pie.
 */

import React, { useState } from "react";
import { apiRequest } from "@utils/apiClient";
import Button from "@components/Button";

/* ── Tokens ── */
const COLOR_BG_DARK = "#0A0A0A";
const COLOR_SURFACE = "var(--color-surface, #FAFAF7)";
const COLOR_PRIMARY = "var(--color-primary-500, #3D4A2A)";
const COLOR_PRIMARY_LIGHT = "var(--color-primary-300, #6B7F4A)";

const GRID_STROKE = "rgba(255,255,255,0.035)";
const GRID_BG = [
  `linear-gradient(${GRID_STROKE} 1px, transparent 1px)`,
  `linear-gradient(90deg, ${GRID_STROKE} 1px, transparent 1px)`,
].join(",");

const VALUE_PROPS = [
  "Solicitar viajes y adelantos",
  "Comprobar aprobaciones al instante",
  "Exportar comprobantes",
] as const;

/* ── Logo con fallback ── */
function CocoLogo({ size = 36 }: { size?: number }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        style={{
          width: size,
          height: size,
          border: `1.5px solid ${COLOR_PRIMARY_LIGHT}`,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: size * 0.22,
            height: size * 0.22,
            backgroundColor: COLOR_PRIMARY_LIGHT,
            borderRadius: 2,
          }}
        />
      </div>
    );
  }

  return (
    <img
      src="/Logo.svg"
      alt="CocoConsulting"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, flexShrink: 0 }}
    />
  );
}

/* ── Componente principal ── */
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

  /* Estilos compartidos */
  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "none",
    borderBottom: "1px solid rgba(10,10,10,0.2)",
    backgroundColor: "transparent",
    padding: "12px 0",
    fontSize: "0.9375rem",
    color: COLOR_BG_DARK,
    outline: "none",
    fontFamily: "var(--font-sans, Inter, system-ui, sans-serif)",
    transition: "border-color 0.2s",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.6875rem",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "rgba(10,10,10,0.5)",
    marginBottom: 8,
    fontFamily: "var(--font-sans, Inter, system-ui, sans-serif)",
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderBottomColor = "var(--color-primary-500, #3D4A2A)";
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderBottomColor = "rgba(10,10,10,0.2)";
  };

  return (
    <div className="flex h-[100dvh] max-h-dvh min-h-0 w-full flex-col overflow-hidden md:flex-row">

      <div
        className={[
          "relative z-0 flex w-full min-w-0 shrink-0 flex-col self-stretch px-4 pb-2 pt-3 text-center",
          "md:h-full md:w-1/2 md:min-h-0 md:shrink-0 md:p-8 md:py-6 md:pl-6 md:pr-6",
          "lg:py-8 lg:pl-8 lg:pr-8",
        ].join(" ")}
        style={{
          backgroundColor: COLOR_BG_DARK,
          backgroundImage: GRID_BG,
          backgroundSize: "28px 28px",
        }}
      >
        <div className="flex w-full shrink-0 justify-center">
          <div className="md:hidden">
            <CocoLogo size={28} />
          </div>
          <div className="hidden md:block">
            <CocoLogo size={36} />
          </div>
        </div>

        {/* text-wrap balance/pretty eliminado: en algunos motores forza caja ~min-content. */}
        <div
          className="mt-3 w-full min-w-0 self-stretch max-md:mt-2 md:mt-3 md:min-h-0 md:flex-1 md:flex md:w-full md:min-w-0 md:flex-col md:items-stretch md:justify-center"
        >
          <div
            className="mx-auto w-full min-w-0 max-w-3xl"
            style={{ width: "100%", maxWidth: "min(100%, 48rem)" }}
          >
            <h1
              style={{
                fontFamily:
                  "var(--font-editorial, Fraunces, 'Instrument Serif', Georgia, serif)",
                fontWeight: 400,
                color: "#fff",
                lineHeight: 1.15,
                width: "100%",
                maxWidth: "100%",
              }}
              className="box-border block w-full min-w-0 text-[1.125rem] leading-[1.25] sm:text-[1.35rem] md:text-[1.75rem] md:leading-[1.2] lg:text-[1.9rem] xl:text-[2rem] xl:leading-[1.12]"
            >
              Agendar viajes no debería ser tan complicado
            </h1>

            <div
              className="mt-2 h-[1.5px] w-8 bg-[var(--color-primary-500)] mx-auto md:mt-4"
              aria-hidden
            />

            {/* Solo desktop: copy + lista (en móvil se oculta para dejar sitio al formulario) */}
            <div className="hidden md:block">
              <p
                className="mt-5 w-full max-w-full"
                style={{
                  fontSize: "0.8125rem",
                  lineHeight: 1.4,
                  color: "rgba(255,255,255,0.45)",
                  fontFamily: "var(--font-sans, Inter, system-ui, sans-serif)",
                  letterSpacing: "0.04em",
                }}
              >
                Lo que puedes hacer con Coco:
              </p>

              <ul
                className="m-0 mt-3 w-full min-w-0 list-none space-y-2 p-0"
                role="list"
                style={{
                  fontSize: "0.8125rem",
                  lineHeight: 1.4,
                  color: "rgba(255,255,255,0.7)",
                  fontFamily: "var(--font-sans, Inter, system-ui, sans-serif)",
                  width: "100%",
                  maxWidth: "100%",
                }}
              >
                {VALUE_PROPS.map((line) => (
                  <li
                    key={line}
                    className="flex w-full min-w-0 max-w-full items-start justify-center gap-3 md:justify-start"
                  >
                    <span
                      className="mt-[0.35em] block shrink-0"
                      style={{
                        width: 5,
                        height: 5,
                        backgroundColor: "var(--color-primary-300, #6B7D52)",
                        borderRadius: 1,
                      }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 text-left">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <p
          className="mt-1.5 w-full shrink-0 text-center md:mt-3 max-md:text-[0.625rem]"
          style={{
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.3)",
            fontFamily: "var(--font-sans, Inter, system-ui, sans-serif)",
          }}
        >
          Ditta Consulting · Licencia corporativa
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
       *  PANEL CLARO — Formulario
       *
       *  Mobile:  flex-1, contenido arriba; scroll solo si viewport muy bajo
       *  Desktop: w-1/2, min-w-[340px], centrado
       * ═══════════════════════════════════════════════════════════════ */}
      <div
        className={[
          "flex w-full min-h-0 flex-1 flex-col justify-start md:justify-center",
          "overflow-y-auto overscroll-contain px-6 py-2 min-[500px]:px-8 min-[500px]:py-5 md:max-h-dvh md:w-1/2 md:min-w-[340px] md:py-8 md:px-12 lg:px-16",
        ].join(" ")}
        style={{ backgroundColor: COLOR_SURFACE }}
      >
        <div style={{ margin: "0 auto", width: "100%", maxWidth: 360 }}>
          {/* Eyebrow */}
          <p
            style={{
              fontSize: "0.6875rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(10,10,10,0.5)",
              fontFamily: "var(--font-sans, Inter, system-ui, sans-serif)",
            }}
          >
            Iniciar sesión
          </p>

          {/* Título */}
          <h2
            className="mt-1 text-[1.35rem] leading-tight md:mt-1.5 md:text-2xl"
            style={{
              fontFamily:
                "var(--font-editorial, Fraunces, 'Instrument Serif', Georgia, serif)",
              fontWeight: 400,
              letterSpacing: "-0.01em",
              color: COLOR_BG_DARK,
            }}
          >
            Bienvenido de vuelta
          </h2>

          {/* Subtítulo */}
          <p
            className="mt-1 md:mt-1"
            style={{
              fontSize: "0.8125rem",
              color: "rgba(10,10,10,0.55)",
              fontFamily: "var(--font-sans, Inter, system-ui, sans-serif)",
            }}
          >
            Usa tu cuenta corporativa
          </p>

          {/* ── Form ── */}
          <form onSubmit={handleSubmit} className="mt-5 md:mt-8">
            {/* Usuario */}
            <div className="mb-4 md:mb-6">
              <label htmlFor="username" style={labelStyle}>
                Usuario
              </label>
              <input
                id="username"
                name="username"
                type="text"
                inputMode="text"
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="none"
                required
                placeholder="nombre@ditta.com.mx"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            {/* Contraseña */}
            <div className="mb-5 md:mb-8">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <label htmlFor="password" style={labelStyle}>
                  Contraseña
                </label>
                <button
                  type="button"
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    fontSize: "0.6875rem",
                    color: "rgba(10,10,10,0.4)",
                    fontFamily:
                      "var(--font-sans, Inter, system-ui, sans-serif)",
                    cursor: "pointer",
                  }}
                  tabIndex={-1}
                >
                  Recuperar
                </button>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            {/* CTA */}
            <Button
              type="submit"
              variant="filled"
              color="primary"
              size="big"
              className="w-full active:scale-[0.99] motion-safe:transition-transform"
              style={{
                minHeight: 48,
                borderRadius: 6,
                fontWeight: 500,
              }}
            >
              Entrar
            </Button>

            {/* Error */}
            {errorMessage && (
              <p
                role="alert"
                style={{
                  marginTop: 16,
                  fontSize: "0.875rem",
                  color: "var(--color-error-500, #C2410C)",
                }}
              >
                {errorMessage}
              </p>
            )}
          </form>

          {/* Footer */}
          <p
            className="mt-5 text-center text-[0.75rem] md:mt-10"
            style={{
              color: "rgba(10,10,10,0.4)",
            }}
          >
            No tienes cuenta?{" "}
            <span style={{ color: "rgba(10,10,10,0.65)" }}>
              Contacta a tu administrador
            </span>
          </p>

          <p
            className="mt-2 hidden text-center text-[0.6875rem] tracking-wide text-[rgba(10,10,10,0.3)] md:mt-5 md:block"
            style={{
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            CocoAPI v0.4.2
          </p>
        </div>
      </div>
    </div>
  );
}