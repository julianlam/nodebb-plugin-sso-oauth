'use strict';

/*
		Welcome to the SSO OAuth plugin! If you're inspecting this code, you're probably looking to
		hook up NodeBB with your existing OAuth endpoint.

		Step 1: Fill in the "constants" section below with the requisite informaton. Either the "oauth"
				or "oauth2" section needs to be filled, depending on what you set "type" to.

		Step 2: Give it a whirl. If you see the congrats message, you're doing well so far!

		Step 3: Customise the `parseUserReturn` method to normalise your user route's data return into
				a format accepted by NodeBB. Instructions are provided there. (Line 146)

		Step 4: If all goes well, you'll be able to login/register via your OAuth endpoint credentials.
	*/

const User = require.main.require('./src/user');
const Groups = require.main.require('./src/groups');
const db = require.main.require('./src/database');
const authenticationController = require.main.require('./src/controllers/authentication');

const async = require('async');

const AzureAdOAuth2Strategy = require('passport-azure-ad').OAuth2Strategy;
const nconf = require.main.require('nconf');
const winston = require.main.require('winston');

/**
	 * REMEMBER
	 *   Never save your OAuth Key/Secret or OAuth2 ID/Secret pair in code! It could be published and leaked accidentally.
	 *   Save it into your config.json file instead:
	 *
	 *   {
	 *     ...
	 *     "oauth": {
	 *       "id": "someoauthid",
	 *       "secret": "youroauthsecret"
	 *     }
	 *     ...
	 *   }
	 *
	 *   ... or use environment variables instead:
	 *
	 *   `OAUTH__ID=someoauthid OAUTH__SECRET=youroauthsecret node app.js`
	 */

const constants = Object.freeze({
    type: 'oauth2',
    name: 'azuread',
    oauth2: {
        authorizationURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        clientID: nconf.get('oauth:id'),
        clientSecret: nconf.get('oauth:secret'),
    },
    userRoute: 'https://graph.microsoft.com/v1.0/me',
});

const OAuth = {};
let configOk = false;
let opts;

if (!constants.name) {
	winston.error('[sso-oauth] Please specify a name for your OAuth provider (library.js:32)');
} else if (!constants.type || (constants.type !== 'oauth' && constants.type !== 'oauth2')) {
	winston.error('[sso-oauth] Please specify an OAuth strategy to utilise (library.js:31)');
} else if (!constants.userRoute) {
	winston.error('[sso-oauth] User Route required (library.js:31)');
} else {
	configOk = true;
}

OAuth.getStrategy = function (strategies, callback) {
	if (configOk) {
        opts = {
            clientID: constants.oauth2.clientID,
            clientSecret: constants.oauth2.clientSecret,
            callbackURL: `${nconf.get('url')}/auth/${constants.name}/callback`,
            resource: 'https://graph.microsoft.com',
            tenant: 'common',
            authorizationURL: constants.oauth2.authorizationURL,
            tokenURL: constants.oauth2.tokenURL,
            passReqToCallback: true,
        };

        passport.use(constants.name, new AzureAdOAuth2Strategy(opts, async (req, accessToken, refreshToken, params, profile, done) => {
            const graphClient = require('@microsoft/microsoft-graph-client').Client.init({
                authProvider: (done) => {
                    done(null, accessToken);
                }
            });

            try {
                const user = await graphClient.api('/me').get();
                OAuth.parseUserReturn(user, (err, profile) => {
                    if (err) return done(err);
                    profile.provider = constants.name;

                    OAuth.login({
                        oAuthid: profile.id,
                        handle: profile.displayName,
                        email: profile.emails[0].value,
                        isAdmin: false,
                    }).then((user) => {
                        authenticationController.onSuccessfulLogin(req, user.uid);
                        done(null, user);
                    }).catch((err) => {
                        done(err);
                    });
                });
            } catch (err) {
                done(err);
            }
        }));

		strategies.push({
			name: constants.name,
			url: `/auth/${constants.name}`,
			callbackURL: `/auth/${constants.name}/callback`,
			icon: 'fa-windows',
			scope: ['openid', 'profile', 'email', 'User.Read'],
		});

		callback(null, strategies);
	} else {
		callback(new Error('OAuth Configuration is invalid'));
	}
};

OAuth.parseUserReturn = function (data, callback) {
    const profile = {};
    profile.id = data.id;
    profile.displayName = data.displayName;
    profile.emails = [{ value: data.mail || data.userPrincipalName }];

    callback(null, profile);
};

OAuth.login = async (payload) => {
	let uid = await OAuth.getUidByOAuthid(payload.oAuthid);
	if (uid !== null) {
		// Existing User
		return ({
			uid: uid,
		});
	}

	// Check for user via email fallback
	uid = await User.getUidByEmail(payload.email);
	if (!uid) {
		/**
			 * The email retrieved from the user profile might not be trusted.
			 * Only you would know — it's up to you to decide whether or not to:
			 *   - Send the welcome email which prompts for verification (default)
			 *   - Bypass the welcome email and automatically verify the email (commented out, below)
			 */
		const { email } = payload;

		// New user
		uid = await User.create({
			username: payload.handle,
			email, // if you uncomment the block below, comment this line out
		});

		// Automatically confirm user email
		// await User.setUserField(uid, 'email', email);
		// await UserEmail.confirmByUid(uid);
	}

	// Save provider-specific information to the user
	await User.setUserField(uid, `${constants.name}Id`, payload.oAuthid);
	await db.setObjectField(`${constants.name}Id:uid`, payload.oAuthid, uid);

	if (payload.isAdmin) {
		await Groups.join('administrators', uid);
	}

	return {
		uid: uid,
	};
};

OAuth.getUidByOAuthid = async oAuthid => db.getObjectField(`${constants.name}Id:uid`, oAuthid);

OAuth.deleteUserData = function (data, callback) {
	async.waterfall([
		async.apply(User.getUserField, data.uid, `${constants.name}Id`),
		function (oAuthIdToDelete, next) {
			db.deleteObjectField(`${constants.name}Id:uid`, oAuthIdToDelete, next);
		},
	], (err) => {
		if (err) {
			winston.error(`[sso-oauth] Could not remove OAuthId data for uid ${data.uid}. Error: ${err}`);
			return callback(err);
		}

		callback(null, data);
	});
};

// If this filter is not there, the deleteUserData function will fail when getting the oauthId for deletion.
OAuth.whitelistFields = function (params, callback) {
	params.whitelist.push(`${constants.name}Id`);
	callback(null, params);
};
