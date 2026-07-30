# SPDX-FileCopyrightText: 2026 Naser Fathi
# SPDX-License-Identifier: AGPL-3.0-or-later

app_name = jalali_calendar
project_dir = $(CURDIR)
build_dir = $(CURDIR)/build
sign_dir = $(build_dir)/sign
package_name = $(build_dir)/artifacts/$(app_name)

# Where `occ` expects the signing key and certificate to live.
cert_dir = $(HOME)/.nextcloud/certificates

.PHONY: all
all: build

.PHONY: build
build:
	npm ci
	npm run build

.PHONY: test
test:
	npm run test

.PHONY: clean
clean:
	rm -rf "$(build_dir)" js/ css/

.PHONY: distclean
distclean: clean
	rm -rf node_modules

# Everything a released app needs at runtime, and nothing else. This is a
# whitelist on purpose: an exclude list silently ships whatever happens to be
# lying around in the working tree.
app_files = appinfo lib templates l10n img js README.md CHANGELOG.md LICENSE

# Build a release tarball and, when the certificate is present, sign it.
# The signature file is what apps.nextcloud.com asks for at upload time.
.PHONY: appstore
appstore: clean build
	mkdir -p "$(sign_dir)/$(app_name)" "$(build_dir)/artifacts"
	rsync -a --exclude="*.map" --exclude=".DS_Store" \
		$(app_files) "$(sign_dir)/$(app_name)/"
	tar -czf "$(package_name).tar.gz" -C "$(sign_dir)" $(app_name)
	@if [ -f "$(cert_dir)/$(app_name).key" ]; then \
		echo "Signing $(package_name).tar.gz …"; \
		openssl dgst -sha512 -sign "$(cert_dir)/$(app_name).key" \
			"$(package_name).tar.gz" | openssl base64 -A > "$(package_name).tar.gz.sig"; \
		echo "Signature written to $(package_name).tar.gz.sig"; \
	else \
		echo "No signing key at $(cert_dir)/$(app_name).key — tarball left unsigned."; \
	fi
