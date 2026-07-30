/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createAppConfig } from '@nextcloud/vite-config'
import { join, resolve } from 'path'

export default createAppConfig({
	main: resolve(join('src', 'main.js')),
	admin: resolve(join('src', 'admin.js')),
	personal: resolve(join('src', 'personal.js')),
}, {
	// Styles ride along in the bundle: building them separately emits
	// hash-named chunks that Util::addStyle() has no way to reference.
	// The controllers therefore only register scripts.
	//
	// relativeCSSInjection matters once there is more than one entry point:
	// without it every entry's CSS is injected from a single chunk, so the
	// admin settings page — which loads only its own bundle — renders unstyled.
	inlineCSS: { relativeCSSInjection: true },
	extractLicenseInformation: true,
	thirdPartyLicense: false,
	config: {
		test: {
			environment: 'jsdom',
			include: ['tests/unit/**/*.spec.js'],
			server: {
				deps: {
					// @nextcloud/vue ships components with `import './x.css'`;
					// externalised, Node chokes on the .css extension.
					inline: ['@nextcloud/vue'],
				},
			},
		},
	},
})
