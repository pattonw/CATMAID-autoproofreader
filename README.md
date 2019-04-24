[![Build Status](https://travis-ci.org/willp24/CATMAID-autoproofreader.svg?branch=master)](https://travis-ci.org/willp24/CATMAID-autoproofreader)
[![Coverage Status](https://coveralls.io/repos/github/willp24/CATMAID-autoproofreader/badge.svg?branch=master)](https://coveralls.io/github/willp24/CATMAID-autoproofreader?branch=master)

# CATMAID-autoproofreader

Autoproofreader is a django application which acts as a drop-in
extension for [CATMAID](http://www.catmaid.org). It contains API
endpoints and static files.

## Quick start

1. Install autoproofreader in whichever python environment is running
CATMAID with `pip install -e path/to/this/directory`

2. Run `python manage.py migrate` to create the autoproofreader models.

3. Run `python manage.py collectstatic -l` to pick up
autoproofreader's static files.
