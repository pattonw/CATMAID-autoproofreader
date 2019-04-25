#!/usr/bin/env bash
# Write config files
set -ev

cd django
sed -i "28i\    'floodfilling'," projects/mysite/pipelinefiles.py
