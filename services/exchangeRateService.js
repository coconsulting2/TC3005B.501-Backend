import axios from 'axios';
import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import https from 'https';

class ExchangeRateService {
  constructor() {
    // Handle test environment where MONGO_URI might be undefined
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/test';
    this.mongoClient = new MongoClient(mongoUri);
    this.db = null;
    this.wiseApiUrl = process.env.NODE_ENV === 'production' 
      ? 'https://api-mtls.transferwise.com/v1/rates' 
      : 'https://api-mtls.wise-sandbox.com/v1/rates';
    this.wiseTokenUrl = process.env.NODE_ENV === 'production'
      ? 'https://api.transferwise.com/oauth/token'
      : 'https://api.wise-sandbox.com/oauth/token';
    this.clientId = process.env.WISE_CLIENT_ID;
    this.clientSecret = process.env.WISE_CLIENT_SECRET;
    this.accessToken = null;
    this.tokenExpiry = null;
    
    // mTLS certificate paths
    this.certPath = process.env.NODE_ENV === 'production'
      ? process.env.WISE_PROD_CERT_PATH || './certs/wise/production-CERTIFICATE.pem'
      : process.env.WISE_SANDBOX_CERT_PATH || './certs/wise/sandbox-CERTIFICATE.pem';
    this.keyPath = process.env.NODE_ENV === 'production'
      ? process.env.WISE_PROD_KEY_PATH || './certs/wise/production-PRIVATE-KEY.key'
      : process.env.WISE_SANDBOX_KEY_PATH || './certs/wise/sandbox-PRIVATE-KEY.key';
    this.caPath = process.env.NODE_ENV === 'production'
      ? process.env.WISE_PROD_CA_PATH || './certs/wise/wise-production.pem'
      : process.env.WISE_SANDBOX_CA_PATH || './certs/wise/wise-sandbox.pem';
  }

  async connectDB() {
    if (!this.db) {
      await this.mongoClient.connect();
      this.db = this.mongoClient.db('cocoadb');
    }
    return this.db;
  }

  createAxiosInstance() {
    return axios.create({
      httpsAgent: new https.Agent({
        cert: fs.readFileSync(this.certPath),
        key: fs.readFileSync(this.keyPath),
        ca: fs.readFileSync(this.caPath),
        rejectUnauthorized: true
      })
    });
  }

  async getAccessToken() {
    try {
      if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.accessToken;
      }

      if (!this.clientId || !this.clientSecret) {
        throw new Error('WISE_CLIENT_ID and WISE_CLIENT_SECRET must be configured');
      }

      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const response = await axios.post(this.wiseTokenUrl, 
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000 * 0.8); // Refresh at 80% of expiry

      return this.accessToken;
    } catch (error) {
      console.error('Error getting access token:', error.response?.data || error.message);
      throw error;
    }
  }

  async getCachedRate(source = 'USD', target = 'MXN') {
    try {
      const db = await this.connectDB();
      const today = new Date().toISOString().split('T')[0];
      
      // Sanitize user input to prevent injection
      const sanitizedSource = String(source).toUpperCase().trim();
      const sanitizedTarget = String(target).toUpperCase().trim();
      
      // Validate currency codes (3 letters max)
      if (!/^[A-Z]{1,3}$/.test(sanitizedSource) || !/^[A-Z]{1,3}$/.test(sanitizedTarget)) {
        throw new Error('Invalid currency codes');
      }
      
      const cachedRate = await db.collection('exchange_rates').findOne({
        source: sanitizedSource,
        target: sanitizedTarget,
        date: today
      });

      if (cachedRate) {
        return {
          rate: cachedRate.rate,
          source: cachedRate.dataSource,
          date: cachedRate.date,
          fromCache: true
        };
      }
    } catch (error) {
      console.error('Error getting cached rate:', error);
    }
    return null;
  }

  async cacheRate(source, target, rate, dataSource) {
    try {
      const db = await this.connectDB();
      const today = new Date().toISOString().split('T')[0];
      
      // Sanitize user input to prevent injection
      const sanitizedSource = String(source).toUpperCase().trim();
      const sanitizedTarget = String(target).toUpperCase().trim();
      
      // Validate currency codes (3 letters max)
      if (!/^[A-Z]{1,3}$/.test(sanitizedSource) || !/^[A-Z]{1,3}$/.test(sanitizedTarget)) {
        throw new Error('Invalid currency codes');
      }
      
      await db.collection('exchange_rates').updateOne(
        { source: sanitizedSource, target: sanitizedTarget, date: today },
        { 
          $set: {
            rate,
            dataSource,
            date: today,
            timestamp: new Date()
          }
        },
        { upsert: true }
      );
    } catch (error) {
      console.error('Error caching rate:', error);
    }
  }

  async getWiseRate(source = 'USD', target = 'MXN') {
    try {
      // Check if Wise credentials are configured
      if (!this.clientId || !this.clientSecret) {
        throw new Error('Wise credentials not configured. Using DOF fallback.');
      }

      const token = await this.getAccessToken();
      const httpsAgent = this.createAxiosInstance();

      const response = await httpsAgent.get(this.wiseApiUrl, {
        params: { source, target },
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.length > 0) {
        return {
          rate: response.data[0].rate,
          source: 'Wise',
          date: new Date().toISOString().split('T')[0],
          fromCache: false
        };
      } else {
        throw new Error('No rate data returned from Wise API');
      }
    } catch (error) {
      console.error('Error fetching Wise rate:', error.response?.data || error.message);
      console.log('Wise API not available, will use DOF fallback');
      throw error;
    }
  }

  async getDOFRate(source = 'USD', target = 'MXN') {
    try {
      const response = await axios.get('https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos', {
        headers: {
          'Bmx-Token': process.env.BANXICO_API_KEY,
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.bmx && response.data.bmx.series && response.data.bmx.series.length > 0) {
        const latestRate = response.data.bmx.series[0].datos[response.data.bmx.series[0].datos.length - 1];
        const rate = parseFloat(latestRate.dato);
        
        return {
          rate: rate,
          source: 'DOF',
          date: latestRate.fecha,
          fromCache: false
        };
      } else {
        throw new Error('No rate data returned from DOF API');
      }
    } catch (error) {
      console.error('Error fetching DOF rate:', error.response?.data || error.message);
      throw error;
    }
  }

  async getExchangeRate(source = 'USD', target = 'MXN') {
    try {
      const cachedRate = await this.getCachedRate(source, target);
      if (cachedRate) {
        return cachedRate;
      }

      let rateData;
      
      try {
        rateData = await this.getWiseRate(source, target);
      } catch (wiseError) {
        console.log('Wise API failed, falling back to DOF');
        try {
          rateData = await this.getDOFRate(source, target);
        } catch (dofError) {
          throw new Error('Both Wise and DOF APIs failed');
        }
      }

      await this.cacheRate(source, target, rateData.rate, rateData.source);
      return rateData;
    } catch (error) {
      console.error('Error getting exchange rate:', error);
      throw error;
    }
  }

  async convertCurrency(amount, source = 'USD', target = 'MXN') {
    try {
      const rateData = await this.getExchangeRate(source, target);
      const convertedAmount = amount * rateData.rate;
      
      return {
        originalAmount: amount,
        originalCurrency: source,
        convertedAmount,
        targetCurrency: target,
        exchangeRate: rateData.rate,
        dataSource: rateData.source,
        rateDate: rateData.date,
        fromCache: rateData.fromCache
      };
    } catch (error) {
      console.error('Error converting currency:', error);
      throw error;
    }
  }

  async getSupportedCurrencies() {
    try {
      // Try Wise first if available
      if (this.clientId && this.clientSecret) {
        try {
          const token = await this.getAccessToken();
          const httpsAgent = this.createAxiosInstance();
          const currenciesUrl = process.env.NODE_ENV === 'production'
            ? 'https://api-mtls.transferwise.com/v1/currencies'
            : 'https://api-mtls.wise-sandbox.com/v1/currencies';

          const response = await httpsAgent.get(currenciesUrl, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          return response.data.map(currency => ({
            code: currency.code,
            name: currency.name,
            symbol: currency.symbol,
            supportsDecimals: currency.supportsDecimals
          }));
        } catch (wiseError) {
          console.log('Wise currencies not available, using Banxico fallback');
        }
      }

      // Fallback to Banxico catalog
      const response = await axios.get('https://www.banxico.org.mx/SieAPIRest/service/v1/catalogoSeries', {
        headers: {
          'Bmx-Token': process.env.BANXICO_API_KEY,
          'Content-Type': 'application/json'
        }
      });

      // Return common currencies based on Banxico data
      return [
        { code: 'MXN', name: 'Mexican Peso', symbol: '$', supportsDecimals: true },
        { code: 'USD', name: 'US Dollar', symbol: '$', supportsDecimals: true },
        { code: 'EUR', name: 'Euro', symbol: 'â\x82¬', supportsDecimals: true },
        { code: 'GBP', name: 'British Pound', symbol: 'Â£', supportsDecimals: true },
        { code: 'JPY', name: 'Japanese Yen', symbol: 'Â¥', supportsDecimals: true },
        { code: 'CAD', name: 'Canadian Dollar', symbol: '$', supportsDecimals: true },
        { code: 'AUD', name: 'Australian Dollar', symbol: '$', supportsDecimals: true },
        { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr', supportsDecimals: true },
        { code: 'CNY', name: 'Chinese Yuan', symbol: 'Â¥', supportsDecimals: true }
      ];
    } catch (error) {
      console.error('Error fetching supported currencies:', error.response?.data || error.message);
      // Return basic currencies as ultimate fallback
      return [
        { code: 'MXN', name: 'Mexican Peso', symbol: '$', supportsDecimals: true },
        { code: 'USD', name: 'US Dollar', symbol: '$', supportsDecimals: true },
        { code: 'EUR', name: 'Euro', symbol: 'â\x82¬', supportsDecimals: true }
      ];
    }
  }

  async getRateHistory(source = 'USD', target = 'MXN', startDate, endDate) {
    try {
      // For now, only USD to MXN is supported with Banxico
      if (source !== 'USD' || target !== 'MXN') {
        throw new Error('Historical rates only available for USD to MXN with Banxico');
      }

      // Format dates for Banxico API (dd/mm/yyyy)
      const formatDate = (date) => {
        const d = new Date(date);
        return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
      };

      const formattedStartDate = formatDate(startDate);
      const formattedEndDate = formatDate(endDate);

      // Try the main endpoint first
      let response;
      try {
        response = await axios.get(`https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/${formattedStartDate}/${formattedEndDate}`, {
          headers: {
            'Bmx-Token': process.env.BANXICO_API_KEY,
            'Content-Type': 'application/json'
          }
        });
      } catch (error) {
        // If main endpoint fails, try without date range (get all data)
        console.log('Date range endpoint failed, trying full data endpoint');
        response = await axios.get('https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos', {
          headers: {
            'Bmx-Token': process.env.BANXICO_API_KEY,
            'Content-Type': 'application/json'
          }
        });
      }

      if (response.data && response.data.bmx && response.data.bmx.series && response.data.bmx.series.length > 0) {
        const series = response.data.bmx.series[0];
        let historicalRates = series.datos.map(rate => ({
          date: rate.fecha,
          rate: parseFloat(rate.dato),
          source: 'DOF'
        }));

        // Filter by date range if we got all data
        if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          historicalRates = historicalRates.filter(rate => {
            if (!rate.fecha) return false;
            // Convert Banxico date format (dd/mm/yyyy) to Date object
            const [day, month, year] = rate.fecha.split('/');
            const rateDate = new Date(`${year}-${month}-${day}`);
            return rateDate >= start && rateDate <= end;
          });
        }

        return historicalRates;
      } else {
        throw new Error('No historical rate data returned from DOF API');
      }
    } catch (error) {
      console.error('Error fetching rate history:', error.response?.data || error.message);
      throw error;
    }
  }
}

export default new ExchangeRateService();
