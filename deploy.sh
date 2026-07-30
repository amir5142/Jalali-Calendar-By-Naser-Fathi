#!/usr/bin/env bash
#
# SPDX-FileCopyrightText: 2026 Naser Fathi
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Deploy jalali_calendar to a Nextcloud server over SSH.
#
#   ./deploy.sh                      # deploy to $SSH_HOST (default: homeserver)
#   SSH_HOST=myserver ./deploy.sh
#   NC_ROOT=/var/www/nextcloud ./deploy.sh
#   ./deploy.sh --dry-run            # show what would happen, change nothing
#
# Idempotent: re-running upgrades an existing install in place. Only the files
# a released app needs are copied — never node_modules, tests or source maps.

set -euo pipefail

APP_ID=jalali_calendar
SSH_HOST="${SSH_HOST:-homeserver}"
NC_ROOT="${NC_ROOT:-}"
DRY_RUN=0

[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

# Must match the `app_files` whitelist in the Makefile.
APP_FILES=(appinfo lib templates l10n img js README.md CHANGELOG.md LICENSE)

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31merror: %s\033[0m\n' "$*" >&2; exit 1; }

say "Checking connectivity to $SSH_HOST"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_HOST" true 2>/dev/null \
	|| die "cannot reach $SSH_HOST over SSH (network down, or key not accepted)"
echo "connected as $(ssh -o BatchMode=yes "$SSH_HOST" 'echo $(whoami)@$(hostname)')"

say "Building the frontend bundle"
if [ "$DRY_RUN" = 1 ]; then
	echo "(dry run) would run: npm ci && npm run build"
else
	npm ci
	npm run build
fi
[ -f js/${APP_ID}-main.mjs ] || die "js/${APP_ID}-main.mjs missing — the build did not produce a bundle"

# ---------------------------------------------------------------------------
# Locate the Nextcloud installation and work out how to run occ.
# ---------------------------------------------------------------------------
say "Locating Nextcloud on $SSH_HOST"
if [ -z "$NC_ROOT" ]; then
	NC_ROOT=$(ssh -o BatchMode=yes "$SSH_HOST" '
		for p in /var/www/nextcloud /var/www/html/nextcloud /var/www/html \
		         /usr/share/nextcloud /opt/nextcloud /srv/nextcloud; do
			[ -f "$p/occ" ] && { echo "$p"; exit 0; }
		done
		find / -maxdepth 6 -name occ -type f -path "*nextcloud*" 2>/dev/null | head -1
	') || true
fi
[ -n "$NC_ROOT" ] || die "could not find a Nextcloud install; pass NC_ROOT=/path/to/nextcloud"
echo "Nextcloud root: $NC_ROOT"

# Prefer custom_apps when the instance defines one, so the app survives a
# core upgrade wiping apps/.
APPS_DIR=$(ssh -o BatchMode=yes "$SSH_HOST" "
	if [ -d '$NC_ROOT/custom_apps' ]; then echo '$NC_ROOT/custom_apps';
	else echo '$NC_ROOT/apps'; fi
")
echo "Apps directory: $APPS_DIR"

# The web user owns the tree; find it rather than assuming www-data.
WEB_USER=$(ssh -o BatchMode=yes "$SSH_HOST" "stat -c '%U' '$NC_ROOT/occ' 2>/dev/null || echo www-data")
echo "Web user: $WEB_USER"

SUDO=""
if ssh -o BatchMode=yes "$SSH_HOST" 'sudo -n true 2>/dev/null'; then
	SUDO="sudo -n"
	echo "sudo: passwordless, available"
else
	echo "sudo: NOT available without a password"
	ssh -o BatchMode=yes "$SSH_HOST" "test -w '$APPS_DIR'" \
		|| die "no passwordless sudo and $APPS_DIR is not writable by $(ssh -o BatchMode=yes "$SSH_HOST" whoami). Run this script as a user who can write there, or grant sudo."
fi

OCC="$SUDO -u $WEB_USER php $NC_ROOT/occ"
[ -z "$SUDO" ] && OCC="php $NC_ROOT/occ"

if [ "$DRY_RUN" = 1 ]; then
	say "Dry run — would now:"
	echo "  1. rsync ${APP_FILES[*]} -> $APPS_DIR/$APP_ID/"
	echo "  2. chown -R $WEB_USER $APPS_DIR/$APP_ID"
	echo "  3. $OCC app:enable $APP_ID"
	echo "  4. $OCC app:list | grep $APP_ID"
	exit 0
fi

# ---------------------------------------------------------------------------
# Copy and enable.
# ---------------------------------------------------------------------------
say "Copying the app to $APPS_DIR/$APP_ID"
STAGING="/tmp/${APP_ID}-deploy-$$"
ssh -o BatchMode=yes "$SSH_HOST" "rm -rf '$STAGING' && mkdir -p '$STAGING/$APP_ID'"

rsync -az --delete --exclude='*.map' --exclude='.DS_Store' \
	"${APP_FILES[@]}" "$SSH_HOST:$STAGING/$APP_ID/"

ssh -o BatchMode=yes "$SSH_HOST" "
	set -e
	$SUDO rm -rf '$APPS_DIR/$APP_ID'
	$SUDO mv '$STAGING/$APP_ID' '$APPS_DIR/$APP_ID'
	$SUDO chown -R '$WEB_USER':'$WEB_USER' '$APPS_DIR/$APP_ID' 2>/dev/null || true
	$SUDO find '$APPS_DIR/$APP_ID' -type d -exec chmod 750 {} +
	$SUDO find '$APPS_DIR/$APP_ID' -type f -exec chmod 640 {} +
	rm -rf '$STAGING'
"

say "Enabling the app"
ssh -o BatchMode=yes "$SSH_HOST" "$OCC app:enable $APP_ID"

say "Verifying"
ssh -o BatchMode=yes "$SSH_HOST" "$OCC app:list | grep -A1 -i '$APP_ID' || true"
ssh -o BatchMode=yes "$SSH_HOST" "$OCC config:app:get $APP_ID installed_version 2>/dev/null || true"

say "Done — open Nextcloud and look for «تقویم جلالی» in the app bar."
