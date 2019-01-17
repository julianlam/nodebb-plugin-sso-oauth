# NodeBB OAuth SSO

NodeBB Plugin that allows users to login/register via any configured OAuth provider. **Please note** that this is not a complete plugin, but merely a skeleton with which you can create your own OAuth SSO plugin for NodeBB (and hopefully share it with others!)

## How to Adapt

1. Fork this plugin
    * ![](http://i.imgur.com/APWHJsa.png)
1. Add the OAuth credentials (around line 30 of `library.js`)
1. Update profile information (around line 137 of `library.js`) with information from the user API call
1. Activate this plugin from the plugins page
1. Restart your NodeBB
1. Let NodeBB take care of the rest

## Trouble?

The NodeBB team builds out SSO plugins for a nominal fee. [Reach out to us for a quote.](mailto:sales@nodebb.org)

Find us on [the community forums](http://community.nodebb.org)!