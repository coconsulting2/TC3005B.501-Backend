#!/usr/bin/env node

import CertificateUtils from "../utils/certificateUtils.js";
import fs from "fs";
import path from "path";

console.log("=== Wise Certificate Setup Script ===\n");

// Setup certificate directories
console.log("1. Setting up certificate directories...");
CertificateUtils.setupCertificateDirectories();

// Generate certificate report
console.log("2. Generating certificate status report...");
const report = CertificateUtils.generateCertificateReport();

console.log(`Environment: ${report.environment}\n`);
console.log("Certificate Files Status:");
console.log(`- Certificate: ${report.files.certificate.exists ? "EXISTS" : "MISSING"} (${report.files.certificate.path})`);
console.log(`- Private Key: ${report.files.privateKey.exists ? "EXISTS" : "MISSING"} (${report.files.privateKey.path})`);
console.log(`- CA Certificate: ${report.files.caCertificate.exists ? "EXISTS" : "MISSING"} (${report.files.caCertificate.path})\n`);

if (report.files.privateKey.exists) {
  console.log("Private Key Security:");
  console.log(`- Secure permissions: ${report.files.privateKey.isSecure ? "YES" : "NO"}`);
  console.log(`- Owner can read: ${report.files.privateKey.permissions.owner.read}`);
  console.log(`- Group can read: ${report.files.privateKey.permissions.group.read}`);
  console.log(`- Others can read: ${report.files.privateKey.permissions.other.read}\n`);
}

if (report.recommendations.length > 0) {
  console.log("Recommendations:");
  report.recommendations.forEach(rec => {
    console.log(`- [${rec.type.toUpperCase()}] ${rec.message}`);
    if (rec.command) {
      console.log(`  Command: ${rec.command}`);
    }
  });
  console.log();
}

console.log("Next Steps:");
console.log("1. Upload CSR files to Wise Developer Hub");
console.log("2. Download certificates from Wise");
console.log("3. Add environment variables to .env file");
console.log("4. Test the configuration");

// Show CSR content for easy copy-paste
const csrPath = report.environment === "production"
  ? "./certs/wise/production-certificate-request.csr"
  : "./certs/wise/sandbox-certificate-request.csr";

if (fs.existsSync(csrPath)) {
  console.log("\n=== CSR Content for Copy-Paste ===");
  const csrContent = fs.readFileSync(csrPath, "utf8");
  console.log(csrContent);
  console.log("=== End CSR Content ===");
} else {
  console.log("\nCSR file not found. Please generate certificates first.");
}
