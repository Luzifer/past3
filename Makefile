default: generate

generate: script index-page

script: public
	docker run --rm -ti -v $(CURDIR):$(CURDIR) -w $(CURDIR) node:alpine \
		sh -exc "npm ci && npx coffee -t -c -o public/app.js app.coffee && chown -R $(shell id -u) public && rm -rf node_modules"

index-page: public
	./generate.py > public/index.html

public:
	mkdir public

clean:
	rm -rf public
