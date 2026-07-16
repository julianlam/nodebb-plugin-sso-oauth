'use strict';

import serverConfig from 'eslint-config-nodebb';
import publicConfig from 'eslint-config-nodebb/public';

export default [
	...publicConfig,
	...serverConfig,
];

