# -*- coding: utf-8 -*-
from __future__ import unicode_literals

"""Specifies static assets (CSS, JS) required by the CATMAID front-end.

This module specifies all the static files that are required by the
extension's front-end.

Static files specified here will be added to CATMAID's index page after
all of CATMAID's own files and dependencies, but before standalone static
files. CSS will be compressed; Javascript will just be concatenated in the
order that the source files are specified.

Globs can be used to pick up multiple source files.
"""

from collections import OrderedDict

import six

STYLESHEETS = OrderedDict()

STYLESHEETS["autoproofreader"] = {
    "source_filenames": ("autoproofreader/css/*.css",),
    "output_filename": "css/autoproofreader.css",
}

libraries_js = OrderedDict([("jsfeat", ["*.js"]), ("toml", ["*.js"])])

JAVASCRIPT = OrderedDict()

JAVASCRIPT["autoproofreader"] = {
    "source_filenames": ("autoproofreader/js/widgets/*.js",),
    "output_filename": "js/autoproofreader.js",
}

for k, v in six.iteritems(libraries_js):
    JAVASCRIPT[k + "-lib"] = {
        "source_filenames": ["autoproofreader/libs/%s/%s" % (k, f) for f in v],
        "output_filename": "js/libs/%s-lib.js" % k,
    }
