#!/usr/bin/env bash
# Write config files
set -ev

cd django
sed -i "28i\    'autoproofreader'," projects/mysite/pipelinefiles.py
