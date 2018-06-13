# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.conf.urls import url

import floodfilling.control

app_name = 'floodfilling'

urlpatterns = [
    url(r'^is-installed$', floodfilling.control.is_installed),
]
