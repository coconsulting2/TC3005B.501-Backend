import crypto from "crypto";
const AES_SECRET_KEY = process.env.AES_SECRET_KEY;

/**
 * Formato histórico adminService.encrypt: IV 16 bytes en hex (32 caracteres) + ciphertext base64.
 * Usuarios creados por seed/Prisma/import guardan email/teléfono en claro → no debemos llamar a createDecipheriv.
 * @param str
 */
function looksLikeEncryptedIvPlusBase64(str) {
  if (typeof str !== "string" || str.length <= 32) return false;
  return /^[0-9a-f]{32}$/i.test(str.slice(0, 32));
}

export const decrypt = (encryptedData) => {
  try {
    if (!encryptedData || typeof encryptedData !== "string") {
      return encryptedData;
    }

    if (!looksLikeEncryptedIvPlusBase64(encryptedData)) {
      return encryptedData;
    }

    const IV = Buffer.from(encryptedData.slice(0, 32), "hex");
    const cipherText = encryptedData.slice(32);

    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(AES_SECRET_KEY), IV);
    let decrypted = decipher.update(cipherText, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    return encryptedData;
  }
};
