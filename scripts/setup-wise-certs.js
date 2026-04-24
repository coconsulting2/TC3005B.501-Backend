#!/usr/bin/env node

import CertificateUtils from "../utils/certificateUtils.js";
import fs from "fs";

console.warn("=== Wise Certificate Setup Script ===\n");

// Setup certificate directories
console.warn("1. Setting up certificate directories...");
CertificateUtils.setupCertificateDirectories();

// Generate certificate report
console.warn("2. Generating certificate status report...");
const report = CertificateUtils.generateCertificateReport();

console.warn(`Environment: ${report.environment}\n`);
console.warn("Certificate Files Status:");
console.warn(`- Certificate: ${report.files.certificate.exists ? "EXISTS" : "MISSING"} (${report.files.certificate.path})`);
console.warn(`- Private Key: ${report.files.privateKey.exists ? "EXISTS" : "MISSING"} (${report.files.privateKey.path})`);
console.warn(`- CA Certificate: ${report.files.caCertificate.exists ? "EXISTS" : "MISSING"} (${report.files.caCertificate.path})\n`);

if (report.files.privateKey.exists) {
  console.warn("Private Key Security:");
  console.warn(`- Secure permissions: ${report.files.privateKey.isSecure ? "YES" : "NO"}`);
  console.warn(`- Owner can read: ${report.files.privateKey.permissions.owner.read}`);
  console.warn(`- Group can read: ${report.files.privateKey.permissions.group.read}`);
  console.warn(`- Others can read: ${report.files.privateKey.permissions.other.read}\n`);
}

if (report.recommendations.length > 0) {
  console.warn("Recommendations:");
  report.recommendations.forEach(rec => {
    console.warn(`- [${rec.type.toUpperCase()}] ${rec.message}`);
    if (rec.command) {
      console.warn(`  Command: ${rec.command}`);
    }
  });
  console.warn();
}

console.warn("Next Steps:");
console.warn("1. Upload CSR files to Wise Developer Hub");
console.warn("2. Download certificates from Wise");
console.warn("3. Add environment variables to .env file");
console.warn("4. Test the configuration");

// Show CSR content for easy copy-paste
const csrPath = report.environment === "production"
  ? "./certs/wise/production-certificate-request.csr"
  : "./certs/wise/sandbox-certificate-request.csr";

if (fs.existsSync(csrPath)) {
  console.warn("\n=== CSR Content for Copy-Paste ===");
  const csrContent = fs.readFileSync(csrPath, "utf8");
  console.warn(csrContent);
  console.warn("=== End CSR Content ===");
} else {
  console.warn("\nCSR file not found. Please generate certificates first.");
}
