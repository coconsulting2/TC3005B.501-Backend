# Exchange Rate Integration

This document describes the implementation of the currency exchange rate integration using Wise API with fallback to DOF (Banxico).

## Features

- **Primary API**: Wise API for real-time exchange rates
- **Fallback API**: DOF (Banxico) API when Wise is unavailable
- **Caching**: Daily rate caching in MongoDB to avoid excessive API calls
- **Automatic Conversion**: Currency conversion with rate information
- **Rate History**: Historical exchange rate data
- **Supported Currencies**: List of available currencies from Wise

## API Endpoints

### Get Exchange Rate
```
GET /api/exchange-rate/rate?source=USD&target=MXN
```

**Response:**
```json
{
  "success": true,
  "data": {
    "rate": 17.5,
    "source": "Wise",
    "date": "2026-04-13",
    "fromCache": false
  },
  "message": "Exchange rate from USD to MXN retrieved successfully"
}
```

### Convert Currency
```
POST /api/exchange-rate/convert
Content-Type: application/json

{
  "amount": 100,
  "source": "USD",
  "target": "MXN"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "originalAmount": 100,
    "originalCurrency": "USD",
    "convertedAmount": 1750,
    "targetCurrency": "MXN",
    "exchangeRate": 17.5,
    "dataSource": "Wise",
    "rateDate": "2026-04-13",
    "fromCache": false
  },
  "message": "Currency conversion from USD to MXN completed successfully"
}
```

### Get Supported Currencies
```
GET /api/exchange-rate/currencies
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "code": "USD",
      "name": "US dollar",
      "symbol": "$",
      "supportsDecimals": true
    },
    {
      "code": "MXN",
      "name": "Mexican peso",
      "symbol": "$",
      "supportsDecimals": true
    }
  ],
  "message": "Supported currencies retrieved successfully"
}
```

### Get Rate History
```
GET /api/exchange-rate/history?source=USD&target=MXN&startDate=2026-04-01&endDate=2026-04-13
```

## Environment Variables

Add these to your `.env` file:

```env
# Currency Exchange API Keys
WISE_API_KEY=your_wise_api_key_here
BANXICO_API_KEY=your_banxico_api_key_here
```

## Database Schema

### Exchange Rates Collection (MongoDB)

```javascript
{
  "_id": ObjectId,
  "source": "USD",           // Source currency code
  "target": "MXN",           // Target currency code
  "rate": 17.5,              // Exchange rate
  "dataSource": "Wise",     // "Wise" or "DOF"
  "date": "2026-04-13",      // Date of the rate
  "updatedAt": ISODate       // Last update timestamp
}
```

## Implementation Details

### Service Layer (`services/exchangeRateService.js`)

- **Caching Logic**: Checks for cached rates for the current date
- **API Priority**: Wise API first, fallback to DOF
- **Error Handling**: Comprehensive error handling with logging
- **Rate Conversion**: Automatic currency conversion with metadata

### Model Layer (`models/exchangeRateModel.js`)

- **Database Operations**: CRUD operations for exchange rates
- **Indexing**: Optimized indexes for performance
- **History Queries**: Rate history and statistics
- **Cleanup**: Automatic cleanup of old rates

### Controller Layer (`controllers/exchangeRateController.js`)

- **Validation**: Input validation using express-validator
- **Error Handling**: Centralized error handling
- **Response Format**: Consistent API response format
- **Rate Limiting**: Protection against excessive requests

## Testing

Run the exchange rate tests:

```bash
npm test -- exchangeRate.test.js
```

## Usage Examples

### Basic Rate Retrieval
```javascript
const rate = await exchangeRateService.getExchangeRate('USD', 'MXN');
console.log(rate.rate); // 17.5
console.log(rate.source); // "Wise"
```

### Currency Conversion
```javascript
const conversion = await exchangeRateService.convertCurrency(100, 'USD', 'MXN');
console.log(conversion.convertedAmount); // 1750
console.log(conversion.exchangeRate); // 17.5
```

### Rate History
```javascript
const history = await exchangeRateService.getRateHistory('USD', 'MXN', '2026-04-01', '2026-04-13');
console.log(history); // Array of historical rates
```

## Error Handling

The service implements comprehensive error handling:

- **API Failures**: Automatic fallback to backup API
- **Network Issues**: Retry logic and timeout handling
- **Validation Errors**: Input validation with clear error messages
- **Database Errors**: Graceful degradation when database is unavailable

## Performance Considerations

- **Caching**: Daily caching reduces API calls by ~95%
- **Database Indexing**: Optimized queries for rate lookups
- **Connection Pooling**: Efficient MongoDB connection management
- **Rate Limiting**: Protection against API abuse

## Security

- **API Keys**: Stored in environment variables
- **Input Validation**: Comprehensive input sanitization
- **Error Messages**: Non-sensitive error information exposed
- **HTTPS**: All API communications over HTTPS

## Monitoring

Monitor the following metrics:

- API response times
- Cache hit/miss ratios
- Error rates by API source
- Database query performance

## Troubleshooting

### Common Issues

1. **API Key Not Found**: Ensure WISE_API_KEY is set in environment
2. **MongoDB Connection**: Check MONGO_URI configuration
3. **Rate Limiting**: Monitor API usage and implement backoff
4. **Cache Stale**: Manual cache refresh available

### Debug Mode

Enable debug logging:

```env
DEBUG=exchange-rate:*
```

This will provide detailed logs for troubleshooting exchange rate operations.
