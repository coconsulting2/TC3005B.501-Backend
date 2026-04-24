import React from "react";
import Button from "@components/Button";
import { apiRequest } from "@utils/apiClient";
import { showAppAlert, showAppAlertAsync } from "@utils/appAlert";

interface Props {
  requestId: number;
  redirectTo?: string;
  token: string;
}

export default function FinishRequestButton({ requestId, redirectTo = "/dashboard", token}: Props) {
  const handleClick = async (): Promise<void> => {
    try {
      // Puedes cambiar el método y la lógica según lo que quieras hacer
      await apiRequest(`/accounts-payable/validate-receipts/${requestId}`, { 
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` } 
    });

      await showAppAlertAsync("Solicitud finalizada correctamente", { variant: "success" });
      window.location.href = redirectTo;
    } catch (error) {
      console.error("Error al finalizar la solicitud", error);
      showAppAlert("Error al finalizar la solicitud.", { variant: "error" });
    }
  };

  return (
    <Button color="success" size="medium" onClick={handleClick}>
      Terminar
    </Button>
  );
}
