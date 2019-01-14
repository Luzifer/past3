#!/usr/bin/env python

import yaml
from jinja2 import Environment, FileSystemLoader

config = yaml.load(open('config.yml', 'r').read())

env = Environment(loader=FileSystemLoader('./'))
template = env.get_template('index.html')
print(template.render({'config': config}))
