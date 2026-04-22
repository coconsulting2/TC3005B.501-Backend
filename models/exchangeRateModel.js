import { MongoClient } from "mongodb";

/**
 * MongoDB-backed data access layer for exchange rates.
 */
class ExchangeRateModel {
  /**
   * Configures the MongoDB client using MONGO_URI.
   */
  constructor() {
    this.mongoClient = new MongoClient(process.env.MONGO_URI);
    this.db = null;
  }

  /**
   * Connects to MongoDB and caches the db handle.
   * @returns {Promise<Object>} Connected database instance.
   */
  async connectDB() {
    if (!this.db) {
      await this.mongoClient.connect();
      this.db = this.mongoClient.db("cocoadb");
    }
    return this.db;
  }

  /**
   * Creates indexes on the exchange_rates collection.
   * @returns {Promise<void>}
   */
  async createIndexes() {
    try {
      const db = await this.connectDB();
      await db.collection("exchange_rates").createIndex(
        { source: 1, target: 1, date: 1 },
        { unique: true }
      );
      await db.collection("exchange_rates").createIndex({ date: 1 });
      await db.collection("exchange_rates").createIndex({ dataSource: 1 });
    } catch (error) {
      console.error("Error creating indexes:", error);
    }
  }

  /**
   * Upserts an exchange rate document.
   * @param {Object} rateData Rate payload with source, target, date, rate, dataSource.
   * @returns {Promise<Object>} MongoDB update result.
   */
  async saveExchangeRate(rateData) {
    try {
      const db = await this.connectDB();
      const result = await db.collection("exchange_rates").updateOne(
        {
          source: rateData.source,
          target: rateData.target,
          date: rateData.date
        },
        {
          $set: {
            rate: rateData.rate,
            dataSource: rateData.dataSource,
            date: rateData.date,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
      return result;
    } catch (error) {
      console.error("Error saving exchange rate:", error);
      throw error;
    }
  }

  /**
   * Retrieves an exchange rate for a given date (today if omitted).
   * @param {string} source Source currency code.
   * @param {string} target Target currency code.
   * @param {string|null} date ISO date string or null for today.
   * @returns {Promise<Object|null>} Rate document or null.
   */
  async getExchangeRate(source, target, date = null) {
    try {
      const db = await this.connectDB();
      const query = { source, target };

      if (date) {
        query.date = date;
      } else {
        query.date = new Date().toISOString().split("T")[0];
      }

      const rate = await db.collection("exchange_rates").findOne(query);
      return rate;
    } catch (error) {
      console.error("Error getting exchange rate:", error);
      throw error;
    }
  }

  /**
   * Returns rate documents within a date range, sorted ascending.
   * @param {string} source Source currency code.
   * @param {string} target Target currency code.
   * @param {string} startDate Inclusive start ISO date.
   * @param {string} endDate Inclusive end ISO date.
   * @returns {Promise<Array<Object>>} Array of rate documents.
   */
  async getRateHistory(source, target, startDate, endDate) {
    try {
      const db = await this.connectDB();
      const rates = await db.collection("exchange_rates")
        .find({
          source,
          target,
          date: {
            $gte: startDate,
            $lte: endDate
          }
        })
        .sort({ date: 1 })
        .toArray();

      return rates;
    } catch (error) {
      console.error("Error getting rate history:", error);
      throw error;
    }
  }

  /**
   * Returns today's rate documents, optionally filtered by source/target.
   * @param {string|null} source Optional source currency code.
   * @param {string|null} target Optional target currency code.
   * @returns {Promise<Array<Object>>} Array of rate documents.
   */
  async getLatestRates(source = null, target = null) {
    try {
      const db = await this.connectDB();
      const today = new Date().toISOString().split("T")[0];

      const query = { date: today };
      if (source) query.source = source;
      if (target) query.target = target;

      const rates = await db.collection("exchange_rates")
        .find(query)
        .toArray();

      return rates;
    } catch (error) {
      console.error("Error getting latest rates:", error);
      throw error;
    }
  }

  /**
   * Deletes rate documents older than the retention window.
   * @param {number} daysToKeep Number of most-recent days to keep.
   * @returns {Promise<number>} Number of deleted documents.
   */
  async deleteOldRates(daysToKeep = 30) {
    try {
      const db = await this.connectDB();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      const cutoffDateString = cutoffDate.toISOString().split("T")[0];

      const result = await db.collection("exchange_rates").deleteMany({
        date: { $lt: cutoffDateString }
      });

      return result.deletedCount;
    } catch (error) {
      console.error("Error deleting old rates:", error);
      throw error;
    }
  }

  /**
   * Computes aggregate statistics for a source/target over a rolling window.
   * @param {string} source Source currency code.
   * @param {string} target Target currency code.
   * @param {number} days Window length in days.
   * @returns {Promise<Object|null>} Aggregation result or null if no data.
   */
  async getRateStatistics(source, target, days = 30) {
    try {
      const db = await this.connectDB();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateString = startDate.toISOString().split("T")[0];

      const rates = await db.collection("exchange_rates")
        .aggregate([
          {
            $match: {
              source,
              target,
              date: { $gte: startDateString }
            }
          },
          {
            $group: {
              _id: null,
              avgRate: { $avg: "$rate" },
              minRate: { $min: "$rate" },
              maxRate: { $max: "$rate" },
              count: { $sum: 1 }
            }
          }
        ])
        .toArray();

      return rates[0] || null;
    } catch (error) {
      console.error("Error getting rate statistics:", error);
      throw error;
    }
  }

  /**
   * Closes the underlying MongoDB client.
   * @returns {Promise<void>}
   */
  async close() {
    if (this.mongoClient) {
      await this.mongoClient.close();
    }
  }
}

export default new ExchangeRateModel();
