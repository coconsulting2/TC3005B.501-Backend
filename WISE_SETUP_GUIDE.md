# Wise API Setup Guide

## Overview

This guide walks you through setting up Wise API authentication with mTLS and OAuth 2.0 for the exchange rate service.

## What I've Completed

### 1. Generated Certificates
- Created private keys and Certificate Signing Requests (CSRs) for both sandbox and production
- Files are located in `certs/wise/` directory
- Private keys have secure permissions (600)

### 2. Updated Exchange Rate Service
- Implemented OAuth 2.0 client credentials flow
- Added mTLS support with certificate validation
- Automatic token management with refresh at 80% expiry
- Fallback to DOF API when Wise fails

### 3. Created Utilities
- Certificate validation and management utilities
- Setup script for easy configuration
- Updated environment variables

## What You Need to Do

### Step 1: Upload CSR to Wise Developer Hub

**For Sandbox Testing:**
1. Go to: https://wise-sandbox.com/developer-hub/
2. Login with your Sandbox account
3. Navigate to "Authentication" section
4. Click "Generate certificate"
5. Enter certificate name: `coconsulting-sandbox`
6. Copy and paste the CSR content (shown below)
7. Submit and download the certificate as `sandbox-CERTIFICATE.pem`
8. Click "Get Wise Certificate" and save as `wise-sandbox.pem`

**For Production (when ready):**
1. Go to: https://wise.com/developer-hub
2. Login with your Production account
3. Follow the same steps with "production" names

### Step 2: Get OAuth 2.0 Credentials

In the Wise Developer Hub, you'll need:
- **Client ID** - Your application identifier
- **Client Secret** - Your application secret

These are provided after your account is approved for API access.

### Step 3: Add Environment Variables

Add these to your `.env` file:

```env
# Wise OAuth 2.0 Configuration
WISE_CLIENT_ID=your_wise_client_id_here
WISE_CLIENT_SECRET=your_wise_client_secret_here

# Banxico API Configuration
BANXICO_API_KEY=your_banxico_api_key_here
```

Certificate paths are already configured with defaults, but you can override them if needed.

### Step 4: Download and Place Certificates

After uploading your CSR to Wise, download the certificates and place them:

```
certs/wise/
  sandbox-CERTIFICATE.pem      # Your certificate from Wise
  wise-sandbox.pem            # Wise's CA certificate
  sandbox-PRIVATE-KEY.key     # Already generated
```

### Step 5: Test the Configuration

Run the setup script to verify everything is working:

```bash
node scripts/setup-wise-certs.js
```

## CSR Content for Copy-Paste

### Sandbox CSR:
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

## Testing mTLS Connection

Once you have the certificates, test with:

```bash
curl -X GET https://api-mtls.wise-sandbox.com/v1/currencies \
  --cert certs/wise/sandbox-CERTIFICATE.pem \
  --key certs/wise/sandbox-PRIVATE-KEY.key \
  --cacert certs/wise/wise-sandbox.pem
```

## Security Notes

- **NEVER** commit private keys to version control
- **NEVER** share private keys with anyone
- Private keys should have permissions 600 (only owner can read)
- Store certificates in a secure location
- Use different certificates for sandbox and production

## API Usage

Once configured, the exchange rate service will:

1. **Automatically obtain OAuth tokens** using client credentials
2. **Use mTLS** for all Wise API calls
3. **Cache exchange rates** daily in MongoDB
4. **Fallback to DOF** if Wise API fails
5. **Handle token refresh** automatically

## Endpoints Available

- `GET /api/exchange-rate/rate` - Get current exchange rate
- `POST /api/exchange-rate/convert` - Convert currency
- `GET /api/exchange-rate/currencies` - List supported currencies
- `GET /api/exchange-rate/history` - Get rate history

## Troubleshooting

### Common Issues:

1. **Certificate not found**: Make sure certificate files are in the correct path
2. **Permission denied**: Check file permissions (should be 600 for private keys)
3. **OAuth token error**: Verify client ID and secret are correct
4. **mTLS handshake failed**: Ensure certificates are properly uploaded to Wise

### Debug Mode:

Enable debug logging:
```env
DEBUG=exchange-rate:*
```

## Support

If you encounter issues:

1. Check the setup script output: `node scripts/setup-wise-certs.js`
2. Verify certificate files exist and have correct permissions
3. Ensure environment variables are properly set
4. Test with curl command above before using the application

The system is designed to gracefully fallback to DOF if Wise API is not available, so your application will continue to work even during setup issues.
