#!/bin/bash
set -euxo pipefail

BUCKET=${BUCKET:-}

[ -z "${BUCKET}" ] && {
	echo 'You need to specify $BUCKET'
	exit 2
}

# Generate assets
make clean generate

# Upload assets
aws s3 cp --acl=public-read --content-type=application/javascript \
	public/app.js "s3://${BUCKET}/app.js"
aws s3 cp --acl=public-read --content-type=text/html \
	public/index.html "s3://${BUCKET}/index.html"
