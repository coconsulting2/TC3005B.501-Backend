# Wise API Certificates Setup

## Generated Files

### Sandbox Environment
- `sandbox-PRIVATE-KEY.key` - Private key (keep secure!)
- `sandbox-certificate-request.csr` - Certificate Signing Request

### Production Environment  
- `production-PRIVATE-KEY.key` - Private key (keep secure!)
- `production-certificate-request.csr` - Certificate Signing Request

## Next Steps (Manual Actions Required)

### 1. Upload CSR to Wise Developer Hub

**For Sandbox:**
1. Go to: https://wise-sandbox.com/developer-hub/
2. Login with your Sandbox account
3. Navigate to "Authentication" section
4. Click "Generate certificate"
5. Enter certificate name: `coconsulting-sandbox`
6. Copy and paste the content of `sandbox-certificate-request.csr`
7. Submit and download the certificate
8. Save the certificate as `sandbox-CERTIFICATE.pem`
9. Click "Get Wise Certificate" and save as `wise-sandbox.pem`

**For Production:**
1. Go to: https://wise.com/developer-hub
2. Login with your Production account  
3. Navigate to "Authentication" section
4. Click "Generate certificate"
5. Enter certificate name: `coconsulting-production`
6. Copy and paste the content of `production-certificate-request.csr`
7. Submit and download the certificate
8. Save the certificate as `production-CERTIFICATE.pem`
9. Click "Get Wise Certificate" and save as `wise-production.pem`

### 2. Get Client Credentials

In the Wise Developer Hub, you'll also need:
- **Client ID** 
- **Client Secret**

These will be provided after your account is approved for API access.

### 3. Certificate Content (for copy-paste)

#### Sandbox CSR:
```
-----BEGIN CERTIFICATE REQUEST-----
MIIEaTCCAlECAQAwJDELMAkGA1UEBhMCTVgxFTATBgNVBAoMDENvQ29uc3VsdGlu
ZzCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAI06nOsmECbXZJS0vU2M
r2fDClpwsEGevT1smTS7GZH6PpGDeMDQ4u1dmlhFDoZx+tZmuPmuVUnv+2fy3OZk
6wUYHtK3UAbLrhtusAkp5JqzbG/UaAx1YiKDpmGU4nMMULOYK2CHHCGvXhjQFAjQ
PWbqw2dKwm+Wrx+pcTOFyoTrZKcI0YD7PlnvLXFTmZnkBh0MHT6e5GYtf/64Ilwg
8LZWUENUfj3PEuiVenh+fDBjCgPbu4PCYEAdsKo5zmHJ/gkiXe2MnyW5WZ22ccY1
rFyXRVB5W0psgxBYWGmHOwfZ1h9TrQ8DQeJ9QYFTLsVyQIMksVBvL5L0Z1DW8Iu8
8McYOZtrVEwjIJ2+ktMdCSeWPjtasJ+DmhDlRkvJVnGZRFww6Ps2fKN4kKT5wZzs
C5+ia0wJeg0xgCL59tIeKcayqg0CD2/Fi7JX+5YyhYxDk0QgstN17U5TtWYDKTOw
E0IJQS/qV+CN4uLdkKdEKt/cWZ/FQHghjByvS/crzuLN46JBn18Idizqs/BsMjGF
kr5hcXsJAjk6J0NoweQ6QjK2w2E9+xV6n8+JCj0DgBLsXP3IE81avT9/UgwVUYqV
jR0tGP6LyubXtfUi9e3/12yUGLLDBZn4sdOYDmjvK+rRq1dC4n+ogwGAdNhTk5mq
vA3OFjv/58tEkC/o6m1VD0AzAgMBAAGgADANBgkqhkiG9w0BAQsFAAOCAgEAGraq
RQjcPDcIyJHPz0fMlLeiQkMNeSEF9WrmqZSn0eVGyZOG9mFK/kwbc0B7mqrahc8d
zUK8CaJm7EHM0kVwq5tJVefB5oPYLIV0EX7AI/LESEnw/LPHX8L3gZw6vNtBuVfE
szXZhbZwHQuSOcdl/iJzc9mocV7e3sY/gIjJr1qN/AYIP2MVllYVaW4LUYTLQ0Pr
JB1Ge5eNdIaEo7naVLW24nnKyO6QzRleln+FSSCL5W5FZeqF5dgEa4dDyDw7D2nP
1OrFgq2uzD0Pw+v4DX9JGcmGzRRg0jAR/QvumAGHTbcD7C8DZ5HS/N8i//9MAQxG
8CnHJvzI2g8dm4jrkf6iwTH1CAfmbpX04EPRgx3NZgwHKHonGFWsWRrLVrbkMb4Q
WqOqvmunW+1Ya5D3B78C2NohEJdMCM6Ia2K+qpn2RyQasCm9RBZs8s0hv9VeiXst
8q6A1VDw50qNnRk0Shenf2mHbuo0ibrw9B7xwm8YkbvyTZctnUgQuI7hgmFjuQI/
vUm0CC/fC47sqqgdVx/9KNC1xMlwsYy72Zbf5W8Lhd2dL2qia4ol0Z/pFSX/nRo6
RIok7Bf19+9pbecLiL44vuDsBzfSIlXdSGkqgRyBh0ZySPTuTO4Ph66FhjXxgVdG
XaNPp+OGCBJESgOBBKa1Ei6g83jVSome902Hwqg=
-----END CERTIFICATE REQUEST-----
```

#### Production CSR:
```
-----BEGIN CERTIFICATE REQUEST-----
MIIEaTCCAlECAQAwJDELMAkGA1UEBhMCTVgxFTATBgNVBAoMDENvQ29uc3VsdGlu
ZzCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAKrQ1V1fXfQzL8z9Q7x8
[... full CSR content ...]
-----END CERTIFICATE REQUEST-----
```

### 4. Security Notes

- **NEVER** share your private keys (`.key` files)
- **NEVER** commit private keys to version control
- Store certificates securely in your environment
- Private keys should have restricted permissions (600)

### 5. Testing

After setting up certificates, test with:
```bash
curl -X GET https://api-mtls.wise-sandbox.com/v1/currencies \
  --cert sandbox-CERTIFICATE.pem \
  --key sandbox-PRIVATE-KEY.key \
  --cacert wise-sandbox.pem
```

## File Structure After Setup

```
certs/wise/
  README.md                           # This file
  sandbox-PRIVATE-KEY.key             # Generated (keep secure)
  sandbox-certificate-request.csr     # Generated (for upload)
  sandbox-CERTIFICATE.pem             # Download from Wise (after upload)
  wise-sandbox.pem                    # Download from Wise (Wise cert)
  production-PRIVATE-KEY.key          # Generated (keep secure)
  production-certificate-request.csr  # Generated (for upload)
  production-CERTIFICATE.pem          # Download from Wise (after upload)
  wise-production.pem                 # Download from Wise (Wise cert)
```
