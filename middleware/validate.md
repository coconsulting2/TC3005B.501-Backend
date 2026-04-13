# Consulta CFDI SAT — referencia rápida

La documentación **única y actualizada** vive en el wiki del monorepo:

**[cocowiki/docs/documentacionAPI-SAT.md](../../cocowiki/docs/documentacionAPI-SAT.md)**

Ahí está definido de forma unificada:

- `expresionImpresa` (`re`, `rr`, `tt`, `id`, `fe`)
- SOAPAction, endpoint, WSDL
- Campos de respuesta (`CodigoEstatus`, `Estado`, EFOS, etc.)
- Mapeo a base de datos (diseño objetivo vs columnas `sat_*` actuales en Prisma)
- Ejemplos cURL / fetch / axios y XML de acuse
- Resiliencia, mock NT-009 y checklist M1

---

## Prueba mínima (cURL)

Misma plantilla que en el wiki; sustituye `RFC_EMISOR`, `RFC_RECEPTOR`, `TOTAL`, `UUID`, `SELLO_8_CHARS`.

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
      <tem:expresionImpresa><![CDATA[?re=RFC_EMISOR&rr=RFC_RECEPTOR&tt=TOTAL&id=UUID&fe=SELLO_8_CHARS]]></tem:expresionImpresa>
    </tem:Consulta>
  </soapenv:Body>
</soapenv:Envelope>'
```

*(Este archivo vive en `middleware/` por historial del repo; no valida rutas Express: es solo documentación SAT.)*
