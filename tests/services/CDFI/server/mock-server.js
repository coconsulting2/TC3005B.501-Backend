/**
 * @file tests/<>/mock-server.js
 * @description Mock server for CDFI verification service [ NT-009 ]
 * @author Angel Montemayor
 */
import express from "express";
import { XMLParser } from "fast-xml-parser";
import { readFile } from "fs/promises";
import { loadInvoiceFixtures } from "./invoiceFixtures.js";

const app = express();
app.use(express.text({ type: "*/*" }));
app.set('trust proxy', true);

const WSDL = await readFile(new URL('./wsdl.xml', import.meta.url), 'utf-8');

const parser = new XMLParser({
    ignoreAttributes: false
});

const INVOICE_FIXTURES = await loadInvoiceFixtures();
const UUID_MAP = new Map(
    INVOICE_FIXTURES.map((fixture) => [fixture.uuid.toLowerCase(), fixture])
);

const RFC_RE = /^[A-Z&\u00d1]{3,4}\d{6}[A-Z0-9]{3}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TT_RE = /^\d+\.\d{2}$/;
const FE_RE = /^[A-Za-z0-9]{8}$/;

function soapResponse({ codigoEstatus, estado, esCancelable = "", estatusCancelacion = "", validacionEFOS = "" }) {
    return `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <ConsultaResponse xmlns="http://tempuri.org/">
      <ConsultaResult xmlns:a="http://schemas.datacontract.org/2004/07/Sat.Cfdi.Negocio.ConsultaCfdi.Servicio" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
        <a:CodigoEstatus>${codigoEstatus}</a:CodigoEstatus>
        <a:EsCancelable>${esCancelable}</a:EsCancelable>
        <a:Estado>${estado}</a:Estado>
        <a:EstatusCancelacion>${estatusCancelacion}</a:EstatusCancelacion>
        <a:ValidacionEFOS>${validacionEFOS}</a:ValidacionEFOS>
      </ConsultaResult>
    </ConsultaResponse>
  </s:Body>
</s:Envelope>`;
}

const RESPONSE_VALID_200 = soapResponse({
    codigoEstatus: "S - Comprobante obtenido satisfactoriamente.",
    estado: "Vigente",
    esCancelable: "Cancelable con aceptación",
    validacionEFOS: "200",
});
const RESPONSE_VALID_201 = soapResponse({
    codigoEstatus: "S - Comprobante obtenido satisfactoriamente.",
    estado: "Vigente",
    esCancelable: "Cancelable con aceptación",
    validacionEFOS: "201",
});
const RESPONSE_N602 = soapResponse({
    codigoEstatus: "N - 602: Comprobante no encontrado.",
    estado: "No Encontrado",
});
const RESPONSE_N601 = soapResponse({
    codigoEstatus: "N - 601: La expresión impresa proporcionada no es válida.",
    estado: "No Encontrado",
});

function buildEfosResponse(code) {
    return soapResponse({
        codigoEstatus: "S - Comprobante obtenido satisfactoriamente.",
        estado: "Vigente",
        esCancelable: "Cancelable con aceptación",
        validacionEFOS: String(code),
    });
}

function parseExpresionImpresa(rawExpression) {
    const raw = String(rawExpression ?? "").trim();
    const withoutCdata = raw
        .replace(/^<!\[CDATA\[/, "")
        .replace(/\]\]>$/, "")
        .trim();
    const normalized = withoutCdata.startsWith("?") ? withoutCdata.slice(1) : withoutCdata;
    return new URLSearchParams(normalized);
}

function responseByScenario(scenario, fixture) {
    switch (scenario) {
        case "vigente":
            return fixture.sat_validacion_efos === "201" ? RESPONSE_VALID_201 : RESPONSE_VALID_200;
        case "vigente201":
            return RESPONSE_VALID_201;
        case "cancelado":
            return soapResponse({
                codigoEstatus: "S - Comprobante obtenido satisfactoriamente.",
                estado: "Cancelado",
                esCancelable: "No cancelable",
                estatusCancelacion: "Cancelado sin aceptación",
                validacionEFOS: fixture.sat_validacion_efos || "200",
            });
        case "noEncontrado":
            return RESPONSE_N602;
        case "efos100":
            return buildEfosResponse("100");
        case "efos101":
        case "efos104":
            return buildEfosResponse("101");
        case "efos102":
            return buildEfosResponse("102");
        case "efos103":
            return buildEfosResponse("103");
        default:
            return RESPONSE_N602;
    }
}

app.get('/', (_, res) => {
    res.status(200).send("Mock serve running OK\n");
});

app.get('/ConsultaCFDIService.svc', (_, res) => {
    res
        .type('text/xml')
        .send(WSDL);
});

app.post("/ConsultaCFDIService.svc", (req, res) => {
    const json = parser.parse(req.body);
    const body = json?.["soap:Envelope"]?.["soap:Body"]?.["tns:Consulta"];
    const args = parseExpresionImpresa(body?.expresionImpresa);

    const required = ['re', 'rr', 'tt', 'id'];
    const missing = required.some(param => !args.get(param));

    const re = String(args.get("re") || "").trim();
    const rr = String(args.get("rr") || "").trim();
    const tt = String(args.get("tt") || "").trim();
    const id = String(args.get("id") || "").trim();
    const fe = args.has("fe") ? String(args.get("fe") || "").trim() : null;

    const malformed =
        !body ||
        missing ||
        !RFC_RE.test(re) ||
        !RFC_RE.test(rr) ||
        !TT_RE.test(tt) ||
        !UUID_RE.test(id) ||
        (fe !== null && !FE_RE.test(fe));

    if (malformed) {
        return res
            .type('text/xml')
            .send(RESPONSE_N601);
    }

    const fixture = UUID_MAP.get(id.toLowerCase());
    if (!fixture) {
        return res.type('text/xml').send(RESPONSE_N602);
    }

    const expectedRe = String(fixture.rfc_emisor || "").trim();
    const expectedRr = String(fixture.rfc_receptor || "").trim();
    const expectedTt = Number(fixture.total).toFixed(2);
    const expectedFe = fixture.uuid.replace(/-/g, "").slice(-8);

    const mismatched =
        re.toUpperCase() !== expectedRe.toUpperCase() ||
        rr.toUpperCase() !== expectedRr.toUpperCase() ||
        tt !== expectedTt ||
        (fe !== null && fe.toUpperCase() !== expectedFe.toUpperCase());

    if (mismatched) {
        return res.type('text/xml').send(RESPONSE_N602);
    }

    res
        .type('text/xml')
        .send(responseByScenario(fixture.satScenario, fixture));
});

let instance;

async function startSATMockServer() {
    const PORT = process.env.SAT_MOCK_PORT || 3001;

    if (instance) return `
    http://localhost:${PORT}/ConsultaCFDIService.svc?wsdl`;
    await new Promise((resolve) => {
        instance = app.listen(PORT, resolve);
    });

    return `http://localhost:${PORT}/ConsultaCFDIService.svc?wsdl`;
}

async function stopSATMockServer() {
    if (!instance) return;

    await new Promise((resolve) => {
        instance.close(resolve);
        instance = undefined;
    });
}

export { app, startSATMockServer, stopSATMockServer };
