const passport = require('passport');
const OIDCStrategy = require('passport-azure-ad').OIDCStrategy;
const mongoose = require('mongoose');
const user = require.main.require('./src/user');
const groups = require.main.require('./src/groups');
const db = require.main.require('./src/database');
const authenticationController = require.main.require('./src/controllers/authentication');
const winston = require.main.require('winston');
const fetch = require('node-fetch');
const cors = require('cors');
const plugin = {};

// Enable CORS for localhost:3000 (React app)
//Todo : Need to remove dynamic urls  , keys to configure from config.js 

const corsOptions = {
  origin: 'http://localhost:3000',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,  // Allows cookies and session tokens to be sent with requests
  optionsSuccessStatus: 204
};
  // Apply CORS middleware
// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/nodebb-users', { useNewUrlParser: true, useUnifiedTopology: true });

// Define the User schema in MongoDB
const userSchema = new mongoose.Schema({
  microsoftId: String,
  username: String,
  email: String,
  createdAt: { type: Date, default: Date.now }
});

const UserModel = mongoose.model('User', userSchema);



// Azure AD OAuth2 Strategy for SSO
passport.use(new OIDCStrategy({
  identityMetadata: `https://login.microsoftonline.com/c90739ab-31ce-4e93-9afb-f86eb9ac4a73/v2.0/.well-known/openid-configuration`,
  clientID: 'd606fcc3-136d-4924-b553-a254361f6203',
  clientSecret: 'cb9be2cd-58f5-4eb8-84e2-56a200c130e1',
  responseType: 'code',
  responseMode: 'form_post',
  redirectUrl: 'http://localhost:4567/auth/callback',
  allowHttpForRedirectUrl: true,
  validateIssuer: false,
  passReqToCallback: true,
  scope: ['profile', 'email', 'openid'],
}, async function (req, iss, sub, profile, accessToken, refreshToken, done) {
  try {
    if (!profile.oid) {
      return done(new Error('No oid found'), null);
    }

    // Login or register the user in NodeBB
    const user = await plugin.login({
      oAuthid: profile.oid,
      handle: profile.displayName,
      email: profile.emails[0].value || profile.userPrincipalName,
    });

    done(null, { uid: user.uid });
  } catch (error) {
    done(error);
  }
}));

// Route Initialization
plugin.init = function (params, callback) {
  console.log('Microsoft auth endpoint hit');
  const app = params.router;
  const middleware = params.middleware;
  // Configure CORS
  app.use(cors(corsOptions)); // Apply CORS middleware
  // Route for manual Microsoft Graph login via access token
  app.post('/api/auth/microsoft', middleware.applyCSRF, async (req, res) => {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ error: 'Access token is required' });
    }

    try {
      // Fetch user profile from Microsoft Graph
      const profile = await plugin.getUserProfileFromGraph(accessToken);

      // Log in or register the user in NodeBB
      const user = await plugin.login({
        oAuthid: profile.id,
        handle: profile.displayName,
        email: profile.mail || profile.userPrincipalName,
      });

      // Create a session
      req.uid = user.uid;
      authenticationController.onSuccessfulLogin(req, res, null);

      res.json({ message: 'Login successful'  });
    } catch (error) {
      winston.error('Authentication error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  });
  callback();
};

// Fetch user profile from Microsoft Graph
plugin.getUserProfileFromGraph = async function (accessToken) {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch user profile');
  }
  return await response.json();
};

// Handle user login or registration
plugin.login = async function (payload) {
  let uid = await plugin.getUidByOAuthid(payload.oAuthid);
  if (uid) {
    // Update user in MongoDB if already exists
    await UserModel.findOneAndUpdate(
      { microsoftId: payload.oAuthid },
      { username: payload.handle, email: payload.email },
      { new: true, upsert: true }
    );
    return { uid };
  }

  // Try finding the user by email
  uid = await user.getUidByEmail(payload.email);
  if (!uid) {
    uid = await user.create({
      username: payload.handle,
      email: payload.email,
    });
  }

  // Associate the Microsoft OAuth ID with the user
  await user.setUserField(uid, 'microsoftId', payload.oAuthid);
  await db.setObjectField('microsoftId:uid', payload.oAuthid, uid);

  // Save new user in MongoDB
  const newUser = new UserModel({
    microsoftId: payload.oAuthid,
    username: payload.handle,
    email: payload.email
  });

  await newUser.save();

  return { uid };
};

// Get UID by OAuth ID
plugin.getUidByOAuthid = async function (oAuthid) {
  return await db.getObjectField('microsoftId:uid', oAuthid);
};

// Middleware to authenticate the user
plugin.authenticate = function (req, res, next) {
  passport.authenticate('azuread-openidconnect', {
    response: res,
    failureRedirect: '/login',
  })(req, res, next);
};

// Add routes for SSO login
plugin.addRoutes = function (params, callback) {
  const app = params.router;
  app.get('/auth/azure', passport.authenticate('azuread-openidconnect'));
  app.post('/auth/azure/callback', passport.authenticate('azuread-openidconnect', {
    failureRedirect: '/login',
    successRedirect: '/',
  }));
  callback();
};

module.exports = plugin;
