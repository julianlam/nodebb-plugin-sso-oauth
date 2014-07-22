(function(module) {
	"use strict";

	var User = module.parent.require('./user'),
		Groups = module.parent.require('./groups'),
		meta = module.parent.require('./meta'),
		db = module.parent.require('../src/database'),
		passport = module.parent.require('passport'),
		fs = module.parent.require('fs'),
		path = module.parent.require('path'),
		nconf = module.parent.require('nconf'),
		winston = module.parent.require('winston'),
		async = module.parent.require('async'),
		passportOAuth;

	var constants = Object.freeze({
		'name': "Generic OAuth",
		'admin': {
			'route': '/plugins/sso-oauth',
			'icon': 'fa-key'
		}
	});

	var OAuth = {};

	OAuth.init = function(app, middleware, controllers, callback) {
		function render(req, res, next) {
			res.render('admin/plugins/sso-oauth', {});
		}

		app.get('/admin/plugins/sso-oauth', middleware.admin.buildHeader, render);
		app.get('/api/admin/plugins/sso-oauth', render);

		callback();
	};

	OAuth.getStrategy = function(strategies, callback) {
		meta.settings.get('sso-oauth', function(err, settings) {
			if (err) {
				winston.error('[plugins/sso-oauth] Could not retrieve OAuth settings: ' + err.message);
			} else if (!settings) {
				settings = {};
			}

			var	oAuthKeys = ['oauth:reqTokenUrl', 'oauth:accessTokenUrl', 'oauth:authUrl', 'oauth:key', 'oauth:secret'],
				oAuth2Keys = ['oauth2:authUrl', 'oauth2:tokenUrl', 'oauth2:id', 'oauth2:secret'],
				configOk = oAuthKeys.every(function(key) {
					return settings[key];
				}) || oAuth2Keys.every(function(key) {
					return settings[key];
				}),
				opts;

			if (settings['oauth:type'] === '2') {
				passportOAuth = require('passport-oauth').OAuth2Strategy;
			} else if (settings['oauth:type'] === '1') {
				passportOAuth = require('passport-oauth').OAuthStrategy;
			}

			if (passportOAuth && configOk) {
				if (settings['oauth:type'] === '1') {
					// OAuth options
					opts = {
						requestTokenURL: settings['oauth:reqTokenUrl'],
						accessTokenURL: settings['oauth:accessTokenUrl'],
						userAuthorizationURL: settings['oauth:authUrl'],
						consumerKey: settings['oauth:key'],
						consumerSecret: settings['oauth:secret'],
						callbackURL: nconf.get('url') + '/auth/generic/callback'
					};

					passportOAuth.Strategy.prototype.userProfile = function(token, secret, params, done) {
						this._oauth.get(settings['oauth:userProfileUrl'], token, secret, function(err, body, res) {
							if (err) { return done(new InternalOAuthError('failed to fetch user profile', err)); }

							try {
								var json = JSON.parse(body);

								var profile = { provider: 'generic' };
								// Uncomment the following lines to include whatever data is necessary
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
				} else if (settings['oauth:type'] === '2') {
					// OAuth 2 options
					opts = {
						authorizationURL: settings['oauth2:authUrl'],
						tokenURL: settings['oauth2:tokenUrl'],
						clientID: settings['oauth2:id'],
						clientSecret: settings['oauth2:secret'],
						callbackURL: nconf.get('url') + '/auth/generic/callback'
					};

					passportOAuth.Strategy.prototype.userProfile = function(accessToken, done) {
						this._oauth2.get(settings['oauth:userProfileUrl'], accessToken, function(err, body, res) {
							if (err) { return done(new InternalOAuthError('failed to fetch user profile', err)); }

							try {
								var json = JSON.parse(body);

								var profile = { provider: 'generic' };
								// Alter this section to include whatever data is necessary
								// NodeBB *requires* the following: id, displayName, emails.
								// Everything else is optional.

								profile.id = json.id;
								profile.displayName = json.name;
								profile.emails = [{ value: json.email }];

								// Do you want to automatically make somebody an admin? This block might help you do that...
								// profile.isAdmin = json.isAdmin ? true : false;

								// Find out what is available by uncommenting this line:
								// console.log(json);

								// Delete or comment out the next TWO (2) lines when you are ready to proceed
								process.stdout.write('===\nAt this point, you\'ll need to customise the above section to id, displayName, and emails into the "profile" object.\n===');
								return done(new Error('Congrats! So far so good -- please see server log for details'));

								done(null, profile);
							} catch(e) {
								done(e);
							}
						});
					};
				}

				passport.use('Generic OAuth', new passportOAuth(opts, function(token, secret, profile, done) {
					OAuth.login({
						oAuthid: profile.id,
						handle: profile.displayName,
						email: profile.emails[0].value,
						isAdmin: profile.isAdmin
					}, function(err, user) {
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
					scope: (settings['oauth:scope'] || '').split(',')
				});

				callback(null, strategies);
			} else {
				winston.info('[plugins/sso-oauth] OAuth Disabled or misconfigured. Proceeding without Generic OAuth Login');
				callback(null, strategies);
			}
		});
	};

	OAuth.login = function(payload, callback) {
		OAuth.getUidByOAuthid(payload.oAuthid, function(err, uid) {
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
					User.setUserField(uid, 'oAuthid', payload.oAuthid);
					db.setObjectField('oAuthid:uid', payload.oAuthid, uid);

					if (payload.isAdmin) {
						Groups.join('administrators', uid, function(err) {
							callback(null, {
								uid: uid
							});
						});
					} else {
						callback(null, {
							uid: uid
						});
					}
				};

				User.getUidByEmail(payload.email, function(err, uid) {
					if(err) {
						return callback(err);
					}

					if (!uid) {
						User.create({
							username: payload.handle,
							email: payload.email
						}, function(err, uid) {
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

	OAuth.addMenuItem = function(custom_header, callback) {
		custom_header.authentication.push({
			"route": constants.admin.route,
			"icon": constants.admin.icon,
			"name": constants.name
		});

		callback(null, custom_header);
	};

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

	OAuth.deleteUserData = function(uid, callback) {
		async.waterfall([
			async.apply(User.getUserField, uid, 'oAuthid'),
			function(oAuthIdToDelete, next) {
				db.deleteObjectField('oAuthid:uid', oAuthIdToDelete, next);
			}
		], function(err) {
			if (err) {
				winston.error('Could not remove OAuthId data for uid ' + uid + '. Error: ' + err);
				return callback(err);
			}
			callback();
		});
	};

	module.exports = OAuth;
}(module));