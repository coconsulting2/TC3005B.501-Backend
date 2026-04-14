# SAT API

## Peticiones

| Variable       | Que es?                                | Ejemplo                                |
|----------------|----------------------------------------|----------------------------------------|
| `RFC_EMISOR`   | RFC de quien emite la factura          | `AAA010101AAA`                         |
| `RFC_RECEPTOR` | RFC de quien la recibe                 | `XAXX010101000`                        |
| `TOTAL`        | Total de la factura con decimales      | `1160.00`                              |
| `UUID`         | Folio fiscal del CFDI                  | `6128396f-c09b-4ec6-8699-43d8e5823b7a` |
| `SELLO`        | Últimos 8 caracteres del sello digital | `abc123==`                             |

**Ejemplo con curl**

```bash
curl --request POST \
  --url https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc \
  --header 'Content-Type: text/xml;charset="utf-8"' \
  --header 'SOAPAction: http://tempuri.org/IConsultaCFDIService/Consulta' \
  --data '
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:Consulta>
      <tem:expresionImpresa><![CDATA[?re=RFC_EMISOR&rr=RFC_RECEPTOR&tt=TOTAL&id=UUID&fe=SELLO]]></tem:expresionImpresa>
    </tem:Consulta>
  </soapenv:Body>
</soapenv:Envelope>'
```

**Ejemplo con fetch**

```typescript
const body = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:Consulta>
      <tem:expresionImpresa><![CDATA[?re=RFC_EMISOR&rr=RFC_RECEPTOR&tt=TOTAL&id=UUID&fe=SELLO]]></tem:expresionImpresa>
    </tem:Consulta>
  </soapenv:Body>
</soapenv:Envelope>
`;

fetch("https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc", {
    method: "POST",
    headers: {
        "Content-Type": 'text/xml;charset="utf-8"',
        "SOAPAction": "http://tempuri.org/IConsultaCFDIService/Consulta",
    },
    body
})
    .then(res => res.text()) // SOAP responde en XML
    .then(data => console.log(data))
    .catch(err => console.error(err));;
```

**Ejemplo con axios**

```typescript

import axios from "axios";

const body = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:Consulta>
      <tem:expresionImpresa><![CDATA[?re=RFC_EMISOR&rr=RFC_RECEPTOR&tt=TOTAL&id=UUID&fe=SELLO]]></tem:expresionImpresa>
    </tem:Consulta>
  </soapenv:Body>
</soapenv:Envelope>
`;

axios.post(
    "https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc",
    body,
    {
        headers: {
            "Content-Type": 'text/xml;charset="utf-8"',
            "SOAPAction": "http://tempuri.org/IConsultaCFDIService/Consulta",
        },
        responseType: "text", // importante para recibir XML
        transformRequest: [(data) => data], // evitar que axios lo modifique
    }
)
    .then(res => {
        console.log(res.data);
    })
    .catch(err => {
        console.error(err);
    });
```

## Responses (Acuse)

**`a:CodigoEstatus`**
El resultado general de la consulta. Solo hay tres valores posibles según la documentación:

- `S - Comprobante obtenido satisfactoriamente.` — lo encontró y todo bien
- `N - 601: La expresión impresa proporcionada no es válida.` — el formato del query está mal o incompleto
- `N - 602: Comprobante no encontrado.` — el UUID no existe en las bases del SAT

---

**`a:Estado`**
El estado fiscal actual del CFDI:

- `Vigente` — la factura está activa y válida
- `Cancelado` — fue cancelada
- `No Encontrado` — no se pudo determinar (viene en los casos N-601 y N-602)

---

**`a:EsCancelable`**
Si la factura **puede** ser cancelada por el emisor. Depende de si tiene documentos relacionados (pagos, notas de
crédito, etc.):

- `Cancelable con aceptación` — el receptor tiene que aprobar la cancelación
- `Cancelable sin aceptación` — el emisor puede cancelarla directo sin que el receptor apruebe
- `No cancelable` — tiene dependencias que lo impiden
- Vacío — cuando no aplica (N-601, N-602, o ya está cancelado)

---

**`a:EstatusCancelacion`**
En qué paso del **proceso de cancelación** está, si es que se inició uno:

- `En proceso` — el emisor solicitó cancelar y espera respuesta del receptor
- `Cancelado sin aceptación` — se canceló directo
- `Plazo vencido` — el receptor no respondió en tiempo y se canceló automáticamente
- `Solicitud rechazada` — el receptor rechazó la cancelación
- Vacío — si no hay ningún proceso de cancelación activo (lo más común en facturas vigentes)

---

**`a:ValidacionEFOS`**
Indica si el **emisor** (o RFCs a cuenta de terceros) está en la lista negra del SAT de empresas fantasma (EFOS =
Empresas que Facturan Operaciones Simuladas). Los códigos:

| Código | Significado                                                                   |
|--------|-------------------------------------------------------------------------------|
| `200`  | Emisor **no** está en lista EFOS                                              |
| `201`  | Emisor y ningún RFC a cuenta de terceros están en EFOS                        |
| `100`  | Emisor **sí** está en EFOS                                                    |
| `101`  | Emisor **y** algún RFC a cuenta de terceros están en EFOS                     |
| `102`  | Emisor no está en EFOS, pero **un** RFC a cuenta de terceros sí               |
| `103`  | Emisor no está en EFOS, pero **alguno** de varios RFC a cuenta de terceros sí |
| `104`  | Emisor **y** alguno de varios RFC a cuenta de terceros están en EFOS          |
| Vacío  | No se pudo validar (N-601 o N-602)                                            |

**Valid**

```xml

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
</s:Envelope>
```

**Wrong Format**

```xml

<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
    <s:Body>
        <ConsultaResponse xmlns="http://tempuri.org/">
            <ConsultaResult xmlns:a="http://schemas.datacontract.org/2004/07/Sat.Cfdi.Negocio.ConsultaCfdi.Servicio"
                            xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
                <a:CodigoEstatus>N - 601: La expresión impresa proporcionada no es valída.</a:CodigoEstatus>
                <a:EsCancelable>Cancelable sin aceptación</a:EsCancelable>
                <a:Estado>No Encontrado</a:Estado>
                <a:EstatusCancelacion/>
                <a:ValidacionEFOS>200</a:ValidacionEFOS>
            </ConsultaResult>
        </ConsultaResponse>
    </s:Body>
</s:Envelope>
```

**Not Found**

```XML

<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
    <s:Body>
        <ConsultaResponse xmlns="http://tempuri.org/">
            <ConsultaResult xmlns:a="http://schemas.datacontract.org/2004/07/Sat.Cfdi.Negocio.ConsultaCfdi.Servicio"
                            xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
                <a:CodigoEstatus>N - 602: Comprobante no encontrado.</a:CodigoEstatus>
                <a:EsCancelable/>
                <a:Estado>No Encontrado</a:Estado>
                <a:EstatusCancelacion/>
                <a:ValidacionEFOS/>
            </ConsultaResult>
        </ConsultaResponse>
    </s:Body>
</s:Envelope>
```

```xml

<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
    <s:Body>
        <ConsultaResponse xmlns="http://tempuri.org/">
            <ConsultaResult xmlns:a="http://schemas.datacontract.org/2004/07/Sat.Cfdi.Negocio.ConsultaCfdi.Servicio"
                            xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
                <a:CodigoEstatus>N - 601: La expresión impresa proporcionada no es valída.</a:CodigoEstatus>
                <a:EsCancelable>Cancelable sin aceptación</a:EsCancelable>
                <a:Estado>No Encontrado</a:Estado>
                <a:EstatusCancelacion/>
                <a:ValidacionEFOS>200</a:ValidacionEFOS>
            </ConsultaResult>
        </ConsultaResponse>
    </s:Body>
</s:Envelope>

```