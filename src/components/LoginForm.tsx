/**
 * Login form — Responsive design.
 */

import React, { useState } from "react";
import { apiRequest } from "@utils/apiClient";
import Button from "@components/Button";

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
      className="flex flex-col items-center justify-center gap-6 min-h-screen px-4 w-full bg-gradient-to-br from-purple-700 via-indigo-800 to-black bg-cover bg-center"
    >
      <img
        src="/Logo.svg"
        className="w-24 h-24 sm:w-32 sm:h-32 drop-shadow-lg"
      />
      <div className="relative w-full max-w-[407px] mx-4 sm:mx-auto py-10 bg-white/10 border border-white/30 backdrop-blur-md rounded-lg shadow-lg flex justify-center items-center">
        <form onSubmit={handleSubmit} className="w-full px-8 text-white">
          <h2 className="text-2xl text-center font-semibold mb-8">Login</h2>

          <div className="relative mb-8 border-b border-white">
            <input
              id="username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="peer w-full h-[50px] bg-transparent border-none outline-none text-white px-1 placeholder-transparent"
              placeholder="Usuario"
            />
            <label
              htmlFor="username"
              className="absolute left-1 text-sm text-white transition-all duration-200
                        peer-placeholder-shown:top-1/2 peer-placeholder-shown:translate-y-[-50%]
                        peer-focus:top-0 peer-focus:text-xs peer-focus:text-white"
            >
              Usuario
            </label>
          </div>

          <div className="relative mb-6 border-b border-white">
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="peer w-full h-[50px] bg-transparent border-none outline-none text-white px-1 placeholder-transparent"
              placeholder="Contraseña"
            />
            <label
              htmlFor="password"
              className="absolute left-1 text-sm text-white transition-all duration-200
                        peer-placeholder-shown:top-1/2 peer-placeholder-shown:translate-y-[-50%]
                        peer-focus:top-0 peer-focus:text-xs peer-focus:text-white"
            >
              Contraseña
            </label>
          </div>

          <Button
            type="submit"
            variant="filled"
            color="primary"
            size="medium"
            className="w-full rounded-full"
          >
            Ingresar
          </Button>

          {errorMessage && (
            <p className="mt-4 text-sm text-center text-red-300">
              {errorMessage}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
