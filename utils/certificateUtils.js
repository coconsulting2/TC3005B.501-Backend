import fs from "fs";
import https from "https";

/**
 *
 */
class CertificateUtils {
  /**
   *
   * @param certPath
   * @param keyPath
   * @param caPath
   */
  static validateCertificateFiles(certPath, keyPath, caPath) {
    const errors = [];

    try {
      fs.accessSync(certPath, fs.constants.R_OK);
    } catch {
      errors.push(`Certificate file not readable: ${certPath}`);
    }

    try {
      fs.accessSync(keyPath, fs.constants.R_OK);
    } catch {
      errors.push(`Private key file not readable: ${keyPath}`);
    }

    try {
      fs.accessSync(caPath, fs.constants.R_OK);
    } catch {
      errors.push(`CA certificate file not readable: ${caPath}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   *
   * @param certPath
   * @param keyPath
   * @param caPath
   */
  static createHttpsAgent(certPath, keyPath, caPath) {
    const validation = CertificateUtils.validateCertificateFiles(certPath, keyPath, caPath);

    if (!validation.isValid) {
      throw new Error(`Certificate validation failed: ${validation.errors.join(", ")}`);
    }

    try {
      return new https.Agent({
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
        ca: fs.readFileSync(caPath),
        rejectUnauthorized: true,
        secureProtocol: "TLSv1_2_method"
      });
    } catch (error) {
      throw new Error(`Failed to create HTTPS agent: ${error.message}`);
    }
  }

  /**
   *
   * @param certPath
   */
  static getCertificateInfo(certPath) {
    try {
      const certContent = fs.readFileSync(certPath, "utf8");

      // Extract basic info from certificate
      const lines = certContent.split("\n");
      const certBody = lines.filter(line =>
        line.startsWith("MI") || line.startsWith("MII") || line.startsWith("M")
      ).join("");

      return {
        exists: true,
        size: fs.statSync(certPath).size,
        bodyLength: certBody.length,
        path: certPath
      };
    } catch (error) {
      return {
        exists: false,
        error: error.message,
        path: certPath
      };
    }
  }

  /**
   *
   * @param keyPath
   */
  static getPrivateKeyInfo(keyPath) {
    try {
      fs.readFileSync(keyPath, "utf8");
      const stats = fs.statSync(keyPath);

      // Check file permissions
      const mode = stats.mode;
      const ownerRead = (mode & parseInt("400", 8)) !== 0;
      const groupRead = (mode & parseInt("040", 8)) !== 0;
      const otherRead = (mode & parseInt("004", 8)) !== 0;

      return {
        exists: true,
        size: stats.size,
        permissions: {
          owner: { read: ownerRead, write: (mode & parseInt("200", 8)) !== 0, execute: (mode & parseInt("100", 8)) !== 0 },
          group: { read: groupRead, write: (mode & parseInt("020", 8)) !== 0, execute: (mode & parseInt("010", 8)) !== 0 },
          other: { read: otherRead, write: (mode & parseInt("002", 8)) !== 0, execute: (mode & parseInt("001", 8)) !== 0 }
        },
        isSecure: ownerRead && !groupRead && !otherRead, // Only owner can read
        path: keyPath
      };
    } catch (error) {
      return {
        exists: false,
        error: error.message,
        path: keyPath
      };
    }
  }

  /**
   *
   */
  static validateCertificatePermissions() {
    const recommendations = [];

    // Check private key permissions
    const keyPath = process.env.NODE_ENV === "production"
      ? process.env.WISE_PROD_KEY_PATH || "./certs/wise/production-PRIVATE-KEY.key"
      : process.env.WISE_SANDBOX_KEY_PATH || "./certs/wise/sandbox-PRIVATE-KEY.key";

    const keyInfo = CertificateUtils.getPrivateKeyInfo(keyPath);

    if (keyInfo.exists && !keyInfo.isSecure) {
      recommendations.push({
        type: "security",
        message: `Private key permissions are too permissive. Run: chmod 600 ${keyPath}`,
        command: `chmod 600 ${keyPath}`
      });
    }

    return recommendations;
  }

  /**
   *
   */
  static generateCertificateReport() {
    const isProduction = process.env.NODE_ENV === "production";
    const certPath = isProduction
      ? process.env.WISE_PROD_CERT_PATH || "./certs/wise/production-CERTIFICATE.pem"
      : process.env.WISE_SANDBOX_CERT_PATH || "./certs/wise/sandbox-CERTIFICATE.pem";
    const keyPath = isProduction
      ? process.env.WISE_PROD_KEY_PATH || "./certs/wise/production-PRIVATE-KEY.key"
      : process.env.WISE_SANDBOX_KEY_PATH || "./certs/wise/sandbox-PRIVATE-KEY.key";
    const caPath = isProduction
      ? process.env.WISE_PROD_CA_PATH || "./certs/wise/wise-production.pem"
      : process.env.WISE_SANDBOX_CA_PATH || "./certs/wise/wise-sandbox.pem";

    const certInfo = CertificateUtils.getCertificateInfo(certPath);
    const keyInfo = CertificateUtils.getPrivateKeyInfo(keyPath);
    const validation = CertificateUtils.validateCertificateFiles(certPath, keyPath, caPath);
    const recommendations = CertificateUtils.validateCertificatePermissions();

    return {
      environment: isProduction ? "production" : "sandbox",
      files: {
        certificate: certInfo,
        privateKey: keyInfo,
        caCertificate: { path: caPath, exists: fs.existsSync(caPath) }
      },
      validation,
      recommendations,
      timestamp: new Date().toISOString()
    };
  }

  /**
   *
   */
  static setupCertificateDirectories() {
    const certDir = "./certs/wise";

    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true });
      console.warn(`Created certificate directory: ${certDir}`);
    }

    // Set proper permissions for certificate directory
    try {
      fs.chmodSync(certDir, "755");
    } catch (error) {
      console.warn(`Could not set directory permissions: ${error.message}`);
    }
  }
}

export default CertificateUtils;
