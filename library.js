'use strict';

/*
		Welcome to the SSO OAuth plugin! If you're inspecting this code, you're probably looking to
		hook up NodeBB with your existing OAuth endpoint.

		Step 1: Fill in the "constants" section below with the requisite informaton. Either the "oauth"
				or "oauth2" section needs to be filled, depending on what you set "type" to.

		Step 2: Give it a whirl. If you see the congrats message, you're doing well so far!

		Step 3: Customise the `parseUserReturn` method to normalise your user route's data return into
				a format accepted by NodeBB. Instructions are provided there. (Line 174)

		Step 4: If all goes well, you'll be able to login/register via your OAuth endpoint credentials.
	*/

const passport = nodebb.require('passport');
const nconf = nodebb.require('nconf');
const winston = nodebb.require('winston');

const User = nodebb.require('./src/user');
const Groups = nodebb.require('./src/groups');
const db = nodebb.require('./src/database');


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
	type: '', // Either 'oauth' or 'oauth2'
	name: '', // Something unique to your OAuth provider in lowercase, like "github", or "nodebb"
	oauth: {
		requestTokenURL: '',
		accessTokenURL: '',
		userAuthorizationURL: '',
		consumerKey: nconf.get('oauth:key'), // don't change this line
		consumerSecret: nconf.get('oauth:secret'), // don't change this line
	},
	oauth2: {
		authorizationURL: '',
		tokenURL: '',
		clientID: nconf.get('oauth:id'), // don't change this line
		clientSecret: nconf.get('oauth:secret'), // don't change this line
	},
	userRoute: '', // This is the address to your app's "user profile" API endpoint (expects JSON)
});

const OAuth = module.exports;
let configOk = false;
let passportOAuth;
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

OAuth.getStrategy = function (strategies) {
	if (!configOk) {
		throw new Error('OAuth Configuration is invalid');
	}
	passportOAuth = require('passport-oauth')[constants.type === 'oauth' ? 'OAuthStrategy' : 'OAuth2Strategy'];

	if (constants.type === 'oauth') {
		// OAuth options
		opts = constants.oauth;
		opts.callbackURL = `${nconf.get('url')}/auth/${constants.name}/callback`;

		passportOAuth.Strategy.prototype.userProfile = function (token, secret, params, done) {
			// If your OAuth provider requires the access token to be sent in the query  parameters
			// instead of the request headers, comment out the next line:
			this._oauth._useAuthorizationHeaderForGET = true;

			this._oauth.get(constants.userRoute, token, secret, (err, body/* , res */) => {
				if (err) {
					return done(err);
				}

				try {
					const json = JSON.parse(body);
					const profile = OAuth.parseUserReturn(json);
					profile.provider = constants.name;
					done(null, profile);
				} catch (err) {
					done(err);
				}
			});
		};
	} else if (constants.type === 'oauth2') {
		// OAuth 2 options
		opts = constants.oauth2;
		opts.callbackURL = `${nconf.get('url')}/auth/${constants.name}/callback`;

		passportOAuth.Strategy.prototype.userProfile = function (accessToken, done) {
			// If your OAuth provider requires the access token to be sent in the query  parameters
			// instead of the request headers, comment out the next line:
			this._oauth2._useAuthorizationHeaderForGET = true;

			this._oauth2.get(constants.userRoute, accessToken, (err, body/* , res */) => {
				if (err) {
					return done(err);
				}

				try {
					const json = JSON.parse(body);
					const profile = OAuth.parseUserReturn(json);
					profile.provider = constants.name;
					done(null, profile);
				} catch (err) {
					done(err);
				}
			});
		};
	}

	opts.passReqToCallback = true;

	passport.use(constants.name, new passportOAuth(opts, async (req, token, secret, profile, done) => {
		const { queued, uid, message } = await OAuth.login({
			oAuthid: profile.id,
			handle: profile.displayName,
			email: profile.emails[0].value,
			isAdmin: profile.isAdmin,
		});

		if (queued) {
			return done(null, false, { message });
		}

		done(null, { uid });
	}));

	strategies.push({
		name: constants.name,
		url: `/auth/${constants.name}`,
		callbackURL: `/auth/${constants.name}/callback`,
		icon: 'fa-check-square',
		icons: {
			normal: 'fa-brands fa-xxx',
			square: 'fa-brands fa-xxx-square',
		},
		labels: {
			login: '[[social:log-in-with-xxx]]',
			register: '[[social:register-with-xxx]]',
		},
		scope: (constants.scope || '').split(','),
	});

	return strategies;
};

OAuth.parseUserReturn = function (data) {
	// Alter this section to include whatever data is necessary
	// NodeBB *requires* the following: id, displayName, emails.
	// Everything else is optional.

	// Find out what is available by uncommenting this line:
	// console.log(data);

	const profile = {};
	profile.id = data.id;
	profile.displayName = data.name;
	profile.emails = [{ value: data.email }];

	// Do you want to automatically make somebody an admin? This line might help you do that...
	// profile.isAdmin = data.isAdmin ? true : false;

	// Delete or comment out the next TWO (2) lines when you are ready to proceed
	process.stdout.write('===\nAt this point, you\'ll need to customise the above section to id, displayName, and emails into the "profile" object.\n===');
	throw new Error('Congrats! So far so good -- please see server log for details');

	// eslint-disable-next-line
	return profile;
};

OAuth.login = async (payload) => {
	let uid = await OAuth.getUidByOAuthid(payload.oAuthid);
	if (uid) { // Existing User
		return { uid };
	}

	// Check for user via email fallback
	uid = await User.getUidByEmail(payload.email);
	if (uid) { // Link oauth account to existing user with same email
		await Promise.all([
			User.setUserField(uid, `${constants.name}Id`, payload.oAuthid),
			db.setObjectField(`${constants.name}Id:uid`, payload.oAuthid, uid),
		]);
		return { uid };
	}

	/**
		 * The email retrieved from the user profile might not be trusted.
		 * Only you would know — it's up to you to decide whether or not to:
		 *   - Send the welcome email which prompts for verification (default)
		 *   - Bypass the welcome email and automatically verify the email (commented out, below)
		 */
	const { email } = payload;
	const autoConfirm = false; // change this to true if you want to automatically confirm the email address
	// New user
	return await User.createOrQueue({
		oAuthid: payload.oAuthid, // passing to create so it can be saved in registration queue
		username: payload.handle,
		email,
	}, {
		emailVerification: autoConfirm ? 'verify' : 'send',
		isAdmin: payload.isAdmin, // check the action:user.createHook below where the user is made an admin
	});
};

OAuth.getUidByOAuthid = async oAuthid => db.getObjectField(`${constants.name}Id:uid`, oAuthid);

OAuth.deleteUserData = async function (data) {
	try {
		const oAuthIdToDelete = await User.getUserField(data.uid, `${constants.name}Id`);
		await db.deleteObjectField(`${constants.name}Id:uid`, oAuthIdToDelete);
	} catch (err) {
		winston.error(`[sso-oauth] Could not remove OAuthId data for uid ${data.uid}. Error: ${err}`);
		throw err;
	}
};

// If this filter is not there, the deleteUserData function will fail when getting the oauthId for deletion.
OAuth.whitelistFields = function (params) {
	params.whitelist.push(`${constants.name}Id`);
	return params;
};

OAuth.addToApprovalQueue = async (hookData) => {
	await saveOAuthSpecificData(hookData.data, hookData.userData);
	return hookData;
};

OAuth.filterUserCreate = async (hookData) => {
	await saveOAuthSpecificData(hookData.user, hookData.data);
	return hookData;
};

async function saveOAuthSpecificData(targetObj, sourceObj) {
	const { oAuthid } = sourceObj;
	if (oAuthid) {
		const uid = await OAuth.getUidByOAuthid(oAuthid);
		if (uid) {
			throw new Error(`[[error:sso-account-exists, ${constants.name}]]`);
		}
		targetObj.oAuthid = oAuthid;
	}
}

OAuth.actionUserCreate = async (hookData) => {
	const { uid } = hookData.user;
	const oAuthid = await User.getUserField(uid, 'oAuthid');
	if (oAuthid) {
		await db.setObjectField(`${constants.name}Id:uid`, oAuthid, uid);
		if (hookData?.opts?.isAdmin) {
			await Groups.join('administrators', uid);
		}
	}
};

OAuth.filterUserGetRegistrationQueue = async (hookData) => {
	const { users } = hookData;
	users.forEach((user) => {
		if (user?.fbid) {
			user.sso = {
				icon: 'fa-brands fa-xxx',
				name: constants.name,
			};
		}
	});
	return hookData;
};
