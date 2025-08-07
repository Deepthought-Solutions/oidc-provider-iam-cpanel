import { exec } from "child_process";
import dotenv from "dotenv";
import crypto from "crypto";
import { DataTypes, Op } from 'sequelize';
import { sequelize } from "./db_adapter.js";
import nodemailer from "nodemailer";
import { v4 as uuidv4 } from 'uuid';
import { TotpSecret } from "./totp.js";

dotenv.config();

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_SECURE = process.env.SMTP_SECURE === 'yes';

export const accountTable = sequelize.define("accounts",{
  uid: {
    type: DataTypes.UUID,
    defaultValue: () => uuidv4(),
    primaryKey: true,
    allowNull: false,
  },
  password: {
    type: DataTypes.STRING(512), // + " COLLATE utf8_unicode_ci",
    defaultValue: null
  },
  email: {
    type: DataTypes.STRING(255), // + " COLLATE utf8_unicode_ci",
    allowNull: false,
    unique: true
  }
},
//  {
//   createdAt: 'created',
//   charset: 'utf8',
//   collate: 'utf8_unicode_ci',
//   engine: 'MyISAM'
// }
);

accountTable.hasOne(TotpSecret, {
  foreignKey: 'account_uid',
  sourceKey: 'uid',
  as: 'totpSecret'
});
TotpSecret.belongsTo(accountTable, {
  foreignKey: 'account_uid',
  targetKey: 'uid'
});

export class Account {
  constructor(account) {
    this.accountId = `${account.uid}`;
    this.profile = {
      email: account.email,
      email_verified: account.emailCheck == 'ok',
      name: account.pseudo,
      admin: account.pseudo == "Admin"
    };
    // store.set(this.accountId, this)
  }

  /**
   * @param use - can either be "id_token" or "userinfo", depending on
   *   where the specific claims are intended to be put in.
   * @param scope - the intended scope, while oidc-provider will mask
   *   claims depending on the scope automatically you might want to skip
   *   loading some claims from external resources etc. based on this detail
   *   or not return them in id tokens but only userinfo and so on.
   */
  async claims(use, scope) { // eslint-disable-line no-unused-vars
    if (this.profile) {
      return {
        sub: this.accountId, // it is essential to always return a sub claim
        email: this.profile.email,
        email_verified: this.profile.email_verified,
        family_name: this.profile.family_name,
        given_name: this.profile.given_name,
        locale: this.profile.locale,
        name: this.profile.name,
        admin: this.profile.admin
      };
    }

    return {
      sub: this.accountId, // it is essential to always return a sub claim

      address: {
        country: '000',
        formatted: '000',
        locality: '000',
        postal_code: '000',
        region: '000',
        street_address: '000',
      },
      birthdate: '1987-10-16',
      email: 'johndoe@example.com',
      email_verified: false,
      family_name: 'Doe',
      gender: 'male',
      given_name: 'John',
      locale: 'en-US',
      middle_name: 'Middle',
      name: 'John Doe',
      nickname: 'Johny',
      phone_number: '+49 000 000000',
      phone_number_verified: false,
      picture: 'http://lorempixel.com/400/200/',
      preferred_username: 'johnny',
      profile: 'https://johnswebsite.com',
      updated_at: 1454704946,
      website: 'http://example.com',
      zoneinfo: 'Europe/Berlin',
    };
  }
  /**
   * Verify account's password and move from md5 to sha512 if needed
   * 
   * @param {accountTable} account
   * @param {string} password 
   */
  static async verifyPassword(account,password) {
    return new Promise((resolve,reject) => {
      console.debug("START verifyPassword")
      if (account == undefined || account ==null) {
        return reject();
      }
      let md5hash = crypto.createHash('md5').update(password).digest("hex")
      let sha512hash = crypto.createHash('sha512').update(password).digest("hex")
      if (
          ( account.password != null && account.password == md5hash )
        ) {
        account.password = sha512hash;
        return account.save()
          .then(() => {
            resolve()
          })
          .catch((error) => {
            reject(error)
          })
      }
      if (account.password != null && account.password == sha512hash) {
        return resolve();
      }
      return reject();
    })


  }

  // static async findByFederated(provider, claims) {
  //   const id = `${provider}.${claims.sub}`;
  //   if (!logins.get(id)) {
  //     logins.set(id, new Account(id, claims));
  //   }
  //   return logins.get(id);
  // }

  static async findByUID(uid) {
    console.debug(`Find by UID:${uid}`)
    let account = await accountTable.findOne({
      where: {
        uid: {
          [Op.eq]: uid
        }
      }
    });
    if (account != null) {
      console.debug(`Found by uid:${account.toJSON()}`)
      // console.log(account.email)
      return new Account(account);
    } else {
      throw "UID not found"
    }
  }
  static async findByLogin(login) {
    console.debug(`Find by login:${login}`);

    if (process.env.NODE_ENV !== 'production') {
      console.debug(`Dev mode: finding or creating user without API call NODE_ENV: ${process.env.NODE_ENV}`);
      const [account] = await accountTable.findOrCreate({
        where: {
          [Op.or]: [{
            email: {
              [Op.eq]: login
            }
          }]
        },
        defaults: {
          email: login,
        },
      });
      return new Account(account);
    }

    return new Promise((resolve, reject) => {
      console.debug(`Prod mode: requesting UAPI call NODE_ENV: ${process.env.NODE_ENV}`);

      exec('/usr/bin/uapi --output=jsonpretty Email list_pops', (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          return reject('UAPI_EXECUTION_ERROR');
        }

        try {
          const uapiResult = JSON.parse(stdout);
          if (uapiResult.result.errors) {
            console.error('UAPI returned an error:', uapiResult.result.errors);
            return reject('UAPI_RETURNED_ERROR');
          }

          const userData = uapiResult.result.data.find(user => user.login === login);

          if (userData) {
            if (userData.suspended_login === 0) {
              accountTable.findOrCreate({
                where: {
                  email: {
                    [Op.eq]: userData.email
                  }
                },
                defaults: {
                  email: userData.email,
                },
              }).then(async ([account, created]) => {
                if (!created && (account.sending !== 'ok' || account.sendingO !== 'ok')) {
                  account.sending = 'ok';
                  account.sendingO = 'ok';
                  await account.save();
                  console.debug(`Reactivated user: ${login}`);
                }
                console.debug(`Found or created user: ${login}`);
                resolve(new Account(account));
              }).catch(dbError => {
                console.error('Database error:', dbError);
                reject('DATABASE_ERROR');
              });
            } else {
              console.warn(`Login attempt for suspended user: ${login}`);
              accountTable.findOne({
                where: {
                  email: {
                    [Op.eq]: userData.email
                  }
                }
              }).then(async (account) => {
                if (account) {
                  account.sending = 'suspended';
                  account.sendingO = 'suspended';
                  await account.save();
                  console.debug(`Deactivated user: ${login}`);
                }
              }).catch(dbError => {
                console.error('Database error during deactivation:', dbError);
              });
              reject('ACCOUNT_SUSPENDED');
            }
          } else {
            console.warn(`User not found in UAPI list: ${login}`);
            reject('LOGIN_NOT_FOUND');
          }
        } catch (parseError) {
          console.error('Failed to parse UAPI output:', parseError);
          reject('UAPI_PARSE_ERROR');
        }
      });
    });
  }
  /**
   *
   * Authenticate user based on login and password against cPanel's UAPI.
   * Fallback to SMTP authentication when uapi is not available.
   * If authentication is successful, find or create the user in the database.
   *
   * @param {string} login - The user's email address.
   * @param {string} password - The user's password.
   * @returns {Promise<Account>} A promise that resolves with an Account instance.
   * @throws {string} "AuthenticationException" if authentication fails.
   */
  static authenticate(login, password) {
    console.debug(`Authenticate start, requested login:${login}`);

    if (process.env.NODE_ENV === 'test' && login === 'test' && password === 'test') {
      console.debug(`Test mode: authenticating 'test' user without UAPI`);
      return new Promise((resolve, reject) => {
        accountTable.findOrCreate({
          where: { email: login },
          defaults: { email: login }
        })
        .then(([account]) => {
          resolve(new Account(account));
        })
        .catch(err => reject(err));
      });
    }

    return new Promise((resolve, reject) => {
      // Simple shell escaping
      const sanitizedLogin = login.replace(/'/g, "'\\''");
      const sanitizedPassword = password.replace(/'/g, "'\\''");

      const uapiCommand = process.env.NODE_ENV === 'test' ? 'uapi' : '/usr/bin/uapi';
      const command = `${uapiCommand} --output=jsonpretty Email verify_password email='${sanitizedLogin}' password='${sanitizedPassword}'`;

      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error} - fallback to SMTP authentication`);
          const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: 465,
            secure: true,
            auth: {
              user: login,
              pass: password,
            },
          });
          return transporter.verify((error, success) => {
            if (error) {
              console.error(`SMTP Authentication failed ${SMTP_HOST}:${SMTP_PORT}:`, error);
              return reject('AuthenticationException');
            }
            console.debug('SMTP Authentication successful');
            accountTable.findOrCreate({
              where: { email: login },
              defaults: {
                email: login,
              }
            })
            .then(([account, created]) => {
              if (created) {
                console.debug(`New account created for email: ${login}`);
              } else {
                console.debug(`Found existing account for email: ${login}`);
              }
              resolve(new Account(account));
            })
            .catch(dbError => {
              console.error('Database error after SMTP authentication:', dbError);
              reject('DatabaseException');
            });
          })
        }

        try {
          const uapiResult = JSON.parse(stdout);
          if (uapiResult.result.errors) {
            console.error('UAPI returned an error:', uapiResult.result.errors);
            return reject('AuthenticationException');
          }

          if (uapiResult.result.data === 1) {
            console.debug('UAPI Authentication successful');
            accountTable.findOrCreate({
              where: { email: login },
              defaults: {
                email: login,
              }
            })
            .then(([account, created]) => {
              if (created) {
                console.debug(`New account created for email: ${login}`);
              } else {
                console.debug(`Found existing account for email: ${login}`);
              }
              resolve(new Account(account));
            })
            .catch(dbError => {
              console.error('Database error after UAPI authentication:', dbError);
              reject('DatabaseException');
            });
          } else {
            console.warn(`UAPI authentication failed for user: ${login}`);
            reject('AuthenticationException');
          }
        } catch (parseError) {
          console.error('Failed to parse UAPI output:', parseError);
          reject('UAPI_PARSE_ERROR');
        }
      });
    });
  }
  static async findAccount(ctx, id, token) { // eslint-disable-line no-unused-vars
    // token is a reference to the token used for which a given account is being loaded,
    //   it is undefined in scenarios where account claims are returned from authorization endpoint
    // ctx is the koa request context
    console.log("========== account.findAccount ===========");
    console.log(token);
    return await findByUID(id);
  }
}

export default Account;