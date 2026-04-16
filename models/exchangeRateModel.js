import { MongoClient } from "mongodb";

/**
 *
 */
class ExchangeRateModel {
  /**
   *
   */
  constructor() {
    this.mongoClient = new MongoClient(process.env.MONGO_URI);
    this.db = null;
  }

  /**
   *
   */
  async connectDB() {
    if (!this.db) {
      await this.mongoClient.connect();
      this.db = this.mongoClient.db("cocoadb");
    }
    return this.db;
  }

  /**
   *
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
   *
   * @param rateData
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
   *
   * @param source
   * @param target
   * @param date
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
   *
   * @param source
   * @param target
   * @param startDate
   * @param endDate
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
   *
   * @param source
   * @param target
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
   *
   * @param daysToKeep
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
   *
   * @param source
   * @param target
   * @param days
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
   *
   */
  async close() {
    if (this.mongoClient) {
      await this.mongoClient.close();
    }
  }
}

export default new ExchangeRateModel();
