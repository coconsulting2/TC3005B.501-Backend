import express from "express";

const app = express();


const RESPONSES = {
    vigente: `
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <ConsultaResponse xmlns="http://tempuri.org/">
      <ConsultaResult xmlns:a="http://schemas.datacontract.org/2004/07/Sat.Cfdi.Negocio.ConsultaCfdi.Servicio"
                      xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
        <a:CodigoEstatus>S - Comprobante obtenido satisfactoriamente.</a:CodigoEstatus>
        <a:EsCancelable>Cancelable con aceptación</a:EsCancelable>
        <a:Estado>Vigente</a:Estado>
        <a:EstatusCancelacion/>
        <a:ValidacionEFOS>200</a:ValidacionEFOS>
      </ConsultaResult>
    </ConsultaResponse>
  </s:Body>
</s:Envelope>`.trim(),

    cancelado: `
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <ConsultaResponse xmlns="http://tempuri.org/">
      <ConsultaResult xmlns:a="http://schemas.datacontract.org/2004/07/Sat.Cfdi.Negocio.ConsultaCfdi.Servicio"
                      xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
        <a:CodigoEstatus>N - 602: Comprobante no encontrado.</a:CodigoEstatus>
        <a:EsCancelable/>
        <a:Estado>Cancelado</a:Estado>
        <a:EstatusCancelacion>Cancelado sin aceptación</a:EstatusCancelacion>
        <a:ValidacionEFOS>200</a:ValidacionEFOS>
      </ConsultaResult>
    </ConsultaResponse>
  </s:Body>
</s:Envelope>`.trim(),

    noEncontrado: `
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <ConsultaResponse xmlns="http://tempuri.org/">
      <ConsultaResult xmlns:a="http://schemas.datacontract.org/2004/07/Sat.Cfdi.Negocio.ConsultaCfdi.Servicio"
                      xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
        <a:CodigoEstatus>N - 601: La expresión impresa proporcionada no es válida.</a:CodigoEstatus>
        <a:EsCancelable/>
        <a:Estado>No Encontrado</a:Estado>
        <a:EstatusCancelacion/>
        <a:ValidacionEFOS/>
      </ConsultaResult>
    </ConsultaResponse>
  </s:Body>
</s:Envelope>`.trim(),
};


const UUID_MAP = {
    "6128396f-c09b-4ec6-8699-43d8e5820001": "vigente",
    "6128396f-c09b-4ec6-8699-43d8e5820002": "cancelado",
    "6128396f-c09b-4ec6-8699-43d8e5820003": "noEncontrado",
};

function extractUUID(rawBody) {
    const match = rawBody.match(/[?&]id=([a-f0-9-]{36})/i);
    return match ? match[1] : null;
}


app.post("/ConsultaCFDIService.svc", express.text({ type: "*/*" }), (req, res) => {
    const uuid = extractUUID(req.body);
    const responseKey = UUID_MAP[uuid] ?? "noEncontrado";

    res
        .status(200)
        .set("Content-Type", 'text/xml;charset="utf-8"')
        .send(RESPONSES[responseKey]);
});

let instance;

async function start_sat_api_mock_server() {
    const PORT = process.env.SAT_MOCK_PORT || 3001;

    if (instance) return `http://localhost:${PORT}`;
    await new Promise((resolve) => {
        instance = app.listen(PORT, resolve);
    });

    return `http://localhost:${PORT}`;
}

async function stop_sat_api_mock_server() {
    if (!instance) return;

    await new Promise((resolve) => {
        instance.close(resolve);
        instance = undefined;
    });
}

export { app, start_sat_api_mock_server, stop_sat_api_mock_server };
