#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
RELEASE_DIR="release"
APP_STAGE="${RELEASE_DIR}/cabana-app"

rm -rf "$RELEASE_DIR"
mkdir -p "$APP_STAGE/web"

echo "Building Cabana ${VERSION}"
npm --prefix web run build
npm --prefix server run build

cp server/dist/server.cjs "$APP_STAGE/server.cjs"
cp -R web/dist "$APP_STAGE/web/dist"
cp LICENSE NOTICE "$APP_STAGE/"
printf '%s\n' "$VERSION" > "$APP_STAGE/VERSION"
cat > "$APP_STAGE/package.json" <<EOF
{
  "name": "cabana",
  "version": "${VERSION}",
  "private": true,
  "description": "Cabana personal cloud server - published application bundle",
  "engines": { "node": ">=24" }
}
EOF

tar --owner=0 --group=0 --numeric-owner -czf "${RELEASE_DIR}/cabana-app.tar.gz" -C "$RELEASE_DIR" cabana-app
(
  cd "$RELEASE_DIR"
  sha256sum cabana-app.tar.gz > cabana-app.tar.gz.sha256
)
cp installer/install.sh "${RELEASE_DIR}/install.sh"
cp installer/uninstall.sh "${RELEASE_DIR}/uninstall.sh"
chmod 0755 "${RELEASE_DIR}/install.sh" "${RELEASE_DIR}/uninstall.sh"

echo "Artifacts:"
ls -lh "${RELEASE_DIR}/cabana-app.tar.gz" "${RELEASE_DIR}/cabana-app.tar.gz.sha256" \
  "${RELEASE_DIR}/install.sh" "${RELEASE_DIR}/uninstall.sh"
