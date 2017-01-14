default: generate

generate: script index-page

script: public
	coffee --bare --compile --output public app.coffee
	python -m jsmin public/app.js > public/app.min.js
	mv public/app.min.js public/app.js

index-page: public
	./generate.py > public/index.html

public:
	mkdir public

clean:
	rm -rf public
