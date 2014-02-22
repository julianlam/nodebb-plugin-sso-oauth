(function(module) {
	"use strict";

	var User = module.parent.require('./user'),
		meta = module.parent.require('./meta'),
		db = module.parent.require('../src/database'),
		passport = module.parent.require('passport'),
		fs = module.parent.require('fs'),
		path = module.parent.require('path'),
		nconf = module.parent.require('nconf'),
		winston = module.parent.require('winston'),
		passportOAuth;

	if (meta.config['social:oauth:type'] === '2') {
		passportOAuth = require('passport-oauth').OAuth2Strategy;
	} else if (meta.config['social:oauth:type'] === '1') {
		passportOAuth = require('passport-oauth').OAuthStrategy;
	}

	var constants = Object.freeze({
		'name': "Generic OAuth",
		'admin': {
			'route': '/oauth',
			'icon': 'fa-key'
		}
	});

	var OAuth = {};

	OAuth.getStrategy = function(strategies) {
		var	oAuthKeys = ['social:oauth:reqTokenUrl', 'social:oauth:accessTokenUrl', 'social:oauth:authUrl', 'social:oauth:key', 'social:oauth:secret'],
			oAuth2Keys = ['social:oauth2:authUrl', 'social:oauth2:tokenUrl', 'social:oauth2:id', 'social:oauth2:secret'],
			configOk = oAuthKeys.every(function(key) {
				return meta.config[key];
			}) || oAuth2Keys.every(function(key) {
				return meta.config[key];
			}),
			opts;

		if (passportOAuth && configOk) {
			if (meta.config['social:oauth:type'] === '1') {
				// OAuth options
				opts = {
					requestTokenURL: meta.config['social:oauth:reqTokenUrl'],
					accessTokenURL: meta.config['social:oauth:accessTokenUrl'],
					userAuthorizationURL: meta.config['social:oauth:authUrl'],
					consumerKey: meta.config['social:oauth:key'],
					consumerSecret: meta.config['social:oauth:secret'],
					callbackURL: nconf.get('url') + '/auth/generic/callback'
				};

				passportOAuth.Strategy.prototype.userProfile = function(token, secret, params, done) {
					this._oauth.get(meta.config['social:oauth:userProfileUrl'], token, secret, function(err, body, res) {
						if (err) { return done(new InternalOAuthError('failed to fetch user profile', err)); }

						try {
							var json = JSON.parse(body);

							var profile = { provider: 'generic' };
							// Alter this section to include whatever data is necessary
							// NodeBB requires the following: id, displayName, emails, e.g.:
							// profile.id = json.id;
							// profile.displayName = json.name;
							// profile.emails = [{ value: json.email }];

							done(null, profile);
						} catch(e) {
							done(e);
						}
					});
				};
			} else if (meta.config['social:oauth:type'] === '2') {
				// OAuth 2 options
				opts = {
					authorizationURL: meta.config['social:oauth2:authUrl'],
					tokenURL: meta.config['social:oauth2:tokenUrl'],
					clientID: meta.config['social:oauth2:id'],
					clientSecret: meta.config['social:oauth2:secret'],
					callbackURL: nconf.get('url') + '/auth/generic/callback'
				};

				passportOAuth.Strategy.prototype.userProfile = function(accessToken, done) {
					this._oauth2.get(meta.config['social:oauth:userProfileUrl'], accessToken, function(err, body, res) {
						if (err) { return done(new InternalOAuthError('failed to fetch user profile', err)); }

						try {
							var json = JSON.parse(body);

							var profile = { provider: 'generic' };
							// Alter this section to include whatever data is necessary
							// NodeBB requires the following: id, displayName, emails, e.g.:
							// profile.id = json.id;
							// profile.displayName = json.name;
							// profile.emails = [{ value: json.email }];

							done(null, profile);
						} catch(e) {
							done(e);
						}
					});
				};
			}

			passport.use('Generic OAuth', new passportOAuth(opts, function(token, secret, profile, done) {
				OAuth.login(profile.id, profile.displayName, profile.emails[0].value, function(err, user) {
					if (err) {
						return done(err);
					}
					done(null, user);
				});
			}));

			strategies.push({
				name: 'Generic OAuth',
				url: '/auth/oauth',
				callbackURL: '/auth/generic/callback',
				icon: 'check',
				scope: (meta.config['social:oauth:scope'] || '').split(',')
			});

			return strategies;
		} else {
			winston.info('[plugins/sso-oauth] OAuth Disabled or misconfigured. Proceeding without Generic OAuth Login');
			return strategies;
		}
	};

	OAuth.login = function(oAuthid, handle, email, callback) {
		OAuth.getUidByOAuthid(oAuthid, function(err, uid) {
			if(err) {
				return callback(err);
			}

			if (uid !== null) {
				// Existing User
				callback(null, {
					uid: uid
				});
			} else {
				// New User
				var success = function(uid) {
					// Save provider-specific information to the user
					User.setUserField(uid, 'oAuthid', oAuthid);
					db.setObjectField('oAuthid:uid', oAuthid, uid);
					callback(null, {
						uid: uid
					});
				};

				User.getUidByEmail(email, function(err, uid) {
					if(err) {
						return callback(err);
					}

					if (!uid) {
						User.create({username: handle, email: email}, function(err, uid) {
							if(err) {
								return callback(err);
							}

							success(uid);
						});
					} else {
						success(uid); // Existing account -- merge
					}
				});
			}
		});
	};

	OAuth.getUidByOAuthid = function(oAuthid, callback) {
		db.getObjectField('oAuthid:uid', oAuthid, function(err, uid) {
			if (err) {
				return callback(err);
			}
			callback(null, uid);
		});
	};

	OAuth.addMenuItem = function(custom_header) {
		custom_header.authentication.push({
			"route": constants.admin.route,
			"icon": constants.admin.icon,
			"name": constants.name
		});

		return custom_header;
	}

	OAuth.addAdminRoute = function(custom_routes, callback) {
		fs.readFile(path.resolve(__dirname, './static/admin.tpl'), function (err, template) {
			custom_routes.routes.push({
				"route": constants.admin.route,
				"method": "get",
				"options": function(req, res, callback) {
					callback({
						req: req,
						res: res,
						route: constants.admin.route,
						name: constants.name,
						content: template
					});
				}
			});

			callback(null, custom_routes);
		});
	};

	module.exports = OAuth;
}(module));