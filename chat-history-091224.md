# Chat Transcript - Tab 1

## User:


[text]  
how would I go about modifying this code to create a NodeBB SSO plugin for Microsoft Entra/Azure AD?


## AI (claude-3.5-sonnet):

To create a NodeBB SSO plugin for Microsoft Entra/Azure AD, you'll need to modify the existing OAuth plugin. Here's a step-by-step guide on how to do this:

1. Update the constants in the `library.js` file:


```48:65:library.js
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
```


Replace this section with:

```javascript
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
```

2. Modify the `parseUserReturn` function to handle Azure AD's user profile data:


```172:194:library.js
OAuth.parseUserReturn = function (data, callback) {
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
	return callback(new Error('Congrats! So far so good -- please see server log for details'));

	// eslint-disable-next-line
		callback(null, profile);
};
```


Replace this section with:

```javascript
OAuth.parseUserReturn = function (data, callback) {
    const profile = {};
    profile.id = data.id;
    profile.displayName = data.displayName;
    profile.emails = [{ value: data.mail || data.userPrincipalName }];

    callback(null, profile);
};
```

3. Update the `opts.scope` in the `getStrategy` function:


```158:164:library.js
		strategies.push({
			name: constants.name,
			url: `/auth/${constants.name}`,
			callbackURL: `/auth/${constants.name}/callback`,
			icon: 'fa-check-square',
			scope: (constants.scope || '').split(','),
		});
```


Replace this section with:

```javascript
strategies.push({
    name: constants.name,
    url: `/auth/${constants.name}`,
    callbackURL: `/auth/${constants.name}/callback`,
    icon: 'fa-windows',
    scope: ['openid', 'profile', 'email', 'User.Read'],
});
```

4. Add the necessary dependencies to `package.json`:


```30:33:package.json
  "dependencies": {
    "async": "^3.2.0",
    "passport-oauth": "~1.0.0"
  },
```


Update this section to include the `passport-azure-ad` package:

```json
"dependencies": {
  "async": "^3.2.0",
  "passport-oauth": "~1.0.0",
  "passport-azure-ad": "^4.3.1"
}
```

5. In the `library.js` file, replace the `passport-oauth` import with `passport-azure-ad`:


```25:25:library.js
const passport = require.main.require('passport');
```


Replace this line with:

```javascript
const AzureAdOAuth2Strategy = require('passport-azure-ad').OAuth2Strategy;
```

6. Update the strategy initialization in the `getStrategy` function:


```83:142:library.js
	if (configOk) {
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
						OAuth.parseUserReturn(json, (err, profile) => {
							if (err) return done(err);
							profile.provider = constants.name;

							done(null, profile);
						});
					} catch (e) {
						done(e);
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
						OAuth.parseUserReturn(json, (err, profile) => {
							if (err) return done(err);
							profile.provider = constants.name;

							done(null, profile);
						});
					} catch (e) {
						done(e);
					}
				});
			};
		}
```


Replace this section with:

```javascript
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
```

These modifications will create a NodeBB SSO plugin for Microsoft Entra/Azure AD. Remember to configure your Azure AD application in the Azure portal and add the appropriate redirect URI. Also, update your NodeBB configuration to include the Azure AD client ID and secret.

## User:


[text]  
find this in the library.js file for me, I can't seem to locate it


## AI (claude-3.5-sonnet):

I apologize for the confusion. It seems that the line you're looking for is not present in the provided code snippet. Let me correct my previous suggestion.

Since the `passport` module is not explicitly imported in the given code, we don't need to replace it. Instead, we should add the import for `AzureAdOAuth2Strategy` at the beginning of the file, near the other imports. 

Add this line near the top of the `library.js` file, along with the other imports:

```javascript:library.js
const AzureAdOAuth2Strategy = require('passport-azure-ad').OAuth2Strategy;
```

This addition will allow you to use the Azure AD OAuth2 strategy in your plugin. Make sure to install the `passport-azure-ad` package as mentioned in the previous response.

Thank you for bringing this to my attention, and I apologize for any confusion caused by my earlier mistake.

## User:


[text]  
how do I isntall the passport-azure-ad package?


## AI (claude-3.5-sonnet):

To install the `passport-azure-ad` package, you need to use npm (Node Package Manager). Here's how you can do it:

1. Open a terminal or command prompt.

2. Navigate to your NodeBB plugin's directory. It should be something like:
   ```
   cd /path/to/your/nodebb/node_modules/nodebb-plugin-sso-oauth
   ```

3. Run the following command:
   ```
   npm install passport-azure-ad
   ```

This command will install the `passport-azure-ad` package and add it to your plugin's `package.json` file.

Alternatively, you can manually add it to your `package.json` file and then run `npm install`:

1. Open your plugin's `package.json` file.

2. In the `dependencies` section, add the following line:
   ```json
   "passport-azure-ad": "^4.3.1"
   ```

3. Save the file.

4. Run `npm install` in your plugin's directory.

After installing the package, make sure to restart your NodeBB server for the changes to take effect.
