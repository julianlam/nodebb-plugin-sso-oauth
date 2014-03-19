# NodeBB OAuth SSO

NodeBB Plugin that allows users to login/register via any configured OAuth provider. **Please note** that this is not a complete plugin, but merely a skeleton with which you can create your own OAuth SSO plugin for NodeBB (and hopefully share it with others!)

## How to Adapt

1. Fork this plugin
    * ![](http://i.imgur.com/APWHJsa.png)
1. Activate it in the plugins page
1. Restart your NodeBB
1. Fill in the proper information in the "Generic OAuth" page
1. Hit "Save" and try to log in with the new OAuth Provider (from `/login`)
1. Update profile information (around line 100 of `library.js`) with information from the user API call
1. Let NodeBB take care of the rest

## Trouble?

Find us on [the community forums](http://community.nodebb.org)!