import { sequelize } from "./db_adapter.js";
import { DataTypes } from 'sequelize';
import * as OTPAuth from "otpauth";

const issuer_name = new URL(process.env.ISSUER_URL).hostname

export const TotpSecret = sequelize.define("totp_secrets", {
    id: {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER
    },
    secret: {
      type: DataTypes.STRING,
      allowNull: false
    },
    account_uid: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true
    }
}, {
    tableName: 'totp_secrets'
});

/**
 * Checks if a user has a TOTP secret.
 * @param {string} accountId - The UID of the account.
 * @returns {Promise<boolean>}
 */
export async function hasTotpSecret(accountId) {
  if (!accountId) return false;
  let count = 0;
  try {
    count = await TotpSecret.count({ where: { account_uid: accountId } });
  } catch {}
  return count > 0;
}

/**
 * Creates and stores a new TOTP secret for a user.
 * @private
 * @param {string} accountId - The UID of the account.
 * @returns {Promise<OTPAuth.Secret>}
 */
async function _createAndStoreSecret(accountId) {
  const secret = new OTPAuth.Secret({ size: 20 });
  await TotpSecret.create({
    account_uid: accountId,
    secret: secret.base32,
  });
  return secret;
}

/**
 * Gets an existing secret or creates a new one, then returns its otpauth URI.
 * This is idempotent and safe to call multiple times (e.g. on page refresh).
 * @param {string} accountId - The UID of the account.
 * @param {string} email - The user's email for the URI label.
 * @returns {Promise<string>} The otpauth URI for QR code generation.
 */
export async function getOrCreateSecretUri(accountId, email) {
  let record = await TotpSecret.findOne({ where: { account_uid: accountId } });
  let secret;

  if (record) {
    secret = OTPAuth.Secret.fromBase32(record.secret);
  } else {
    secret = await _createAndStoreSecret(accountId);
  }

  const totp = new OTPAuth.TOTP({
    issuer: issuer_name,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: secret,
  });

  return totp.toString();
}

/**
 * Verifies a TOTP token.
 * @param {string} accountId - The UID of the account.
 * @param {string} token - The TOTP token from the user.
 * @returns {Promise<boolean>} - True if the token is valid, false otherwise.
 */
export async function verifyToken(accountId, token) {
  const record = await TotpSecret.findOne({ where: { account_uid: accountId } });
  if (!record) {
    return false;
  }

  // OTPAuth.Secret is not serializable, so we need to reconstruct it.
  const secret = OTPAuth.Secret.fromBase32(record.secret);

  const totp = new OTPAuth.TOTP({
    issuer: issuer_name,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: secret,
  });

  const delta = totp.validate({ token, window: 1 });

  return delta !== null;
}
